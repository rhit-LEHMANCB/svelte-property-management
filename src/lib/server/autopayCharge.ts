import type Stripe from 'stripe';
import {
	FieldValue,
	type DocumentReference,
	type Query,
	type QuerySnapshot
} from 'firebase-admin/firestore';
import { adminDB } from './admin';
import {
	autopayFeeCents,
	chargeId,
	MAX_ATTEMPTS,
	planAutopay,
	type ChargeFailure,
	type ChargeRecord,
	type Enrollment
} from './autopay';
import { chargesRef, loadCharges, loadEnrollments } from './autopayStore';
import { loadLedgerRecords } from './balance';
import { allocate, allocationParts, computeLedger, type Ledger } from './billing';
import { businessToday, type LeaseDoc } from './leaseDates';
import { stripe } from './stripe';

/**
 * The autopay step of the daily job: charges enrolled tenants on one lease. Every charge is claimed
 * in Firestore before Stripe is called, and every Stripe request carries an idempotency key derived
 * from the lease, due date, tenant and attempt, so neither an overlapping run nor a crash can charge
 * twice.
 */

/** A claim older than this belongs to a run that died; the same as the daily job's lock. */
export const CLAIM_STALE_MINUTES = 10;

export const isStaleCharge = (charge: ChargeRecord, now: Date) =>
	charge.state === 'claimed' &&
	charge.claimedAt < new Date(now.getTime() - CLAIM_STALE_MINUTES * 60_000).toISOString();

export type AutopayOutcome = 'succeeded' | 'pending' | 'failed' | 'gave-up';

export type AutopayCharge = {
	leaseId: string;
	uid: string;
	cycleKey: string;
	attempt: number;
	amountCents: number;
	feeCents: number;
	outcome: AutopayOutcome;
	error?: string;
};

type Attempt = {
	leaseId: string;
	lease: LeaseDoc;
	ledger: Ledger;
	cycleKey: string;
	enrollment: Enrollment;
	customer: string;
	attempt: number;
	resume: number;
	amountCents: number;
	feeCents: number;
	chargeRef: DocumentReference;
};

/** Stripe errors that mean the payment method was refused, as opposed to a request that failed. */
const DECLINE_CODES = new Set([
	'card_declined',
	'expired_card',
	'incorrect_cvc',
	'insufficient_funds',
	'authentication_required',
	'invoice_payment_intent_requires_action',
	'payment_intent_authentication_failure',
	'payment_intent_payment_attempt_failed',
	'payment_method_unactivated',
	'payment_method_not_available',
	'bank_account_unusable',
	'bank_account_declined'
]);

export function isDecline(err: unknown) {
	const e = err as { type?: string; code?: string } | undefined;
	return (
		e?.type === 'StripeCardError' || (typeof e?.code === 'string' && DECLINE_CODES.has(e.code))
	);
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The payment intent of an invoice under the pinned API version (expanded where requested). */
const paymentIntentOf = (invoice: Stripe.Invoice) =>
	(invoice as unknown as { payment_intent?: Stripe.PaymentIntent | string | null }).payment_intent;

/** What a paid-or-not invoice means for the charge. */
function outcomeOf(invoice: Stripe.Invoice): 'succeeded' | 'pending' | 'declined' {
	if (invoice.status === 'paid') return 'succeeded';
	const intent = paymentIntentOf(invoice);
	if (intent && typeof intent !== 'string' && intent.status === 'processing') return 'pending';
	return 'declined';
}

const declineReason = (invoice: Stripe.Invoice) => {
	const intent = paymentIntentOf(invoice);
	return (
		(intent && typeof intent !== 'string' && intent.last_payment_error?.message) ||
		'The payment was not completed'
	);
};

const voidQuietly = (invoiceId: string) =>
	stripe.invoices.voidInvoice(invoiceId).catch((err) => {
		console.error(`Could not void autopay invoice ${invoiceId}: ${errorMessage(err)}`);
	});

/** Creates, fills, finalizes and pays the invoice for one attempt. */
async function payInvoice(
	a: Attempt
): Promise<{ outcome: 'succeeded' | 'pending' | 'declined'; error?: string; invoiceId: string }> {
	const key = (step: string) => ({
		idempotencyKey: `autopay-${a.leaseId}-${a.cycleKey}-${a.enrollment.uid}-a${a.attempt}-r${a.resume}-${step}`
	});
	// The same split as Checkout and the webhook: late fees, then the deposit, then rent.
	const parts = allocationParts(allocate(a.ledger, a.lease, a.amountCents));
	const invoice = await stripe.invoices.create(
		{
			customer: a.customer,
			collection_method: 'charge_automatically',
			auto_advance: false,
			default_payment_method: a.enrollment.paymentMethodId,
			pending_invoice_items_behavior: 'exclude',
			description: 'Autopay',
			metadata: {
				leaseID: a.leaseId,
				propertyID: a.lease.propertyId,
				rentCents: String(parts.rentCents),
				depositCents: String(parts.depositCents),
				lateFeeCents: String(parts.lateFeeCents),
				feeCents: String(a.feeCents),
				autopay: 'true',
				uid: a.enrollment.uid,
				cycleKey: a.cycleKey
			}
		},
		key('invoice')
	);
	const invoiceId = invoice.id!;
	// Kept on the claim, so a run that dies after this point can settle the invoice it left.
	await a.chargeRef.set({ invoiceId }, { merge: true });

	const lines: [string, number][] = [
		['Late Fee', parts.lateFeeCents],
		['Security Deposit', parts.depositCents],
		['Rent', parts.rentCents],
		['Transaction Fee', a.feeCents]
	];
	for (const [description, amount] of lines) {
		if (amount <= 0) continue;
		await stripe.invoiceItems.create(
			{ customer: a.customer, invoice: invoiceId, amount, currency: 'usd', description },
			key(`item-${description.replace(/ /g, '-').toLowerCase()}`)
		);
	}
	await stripe.invoices.finalizeInvoice(invoiceId, { auto_advance: false }, key('finalize'));

	try {
		const paid = await stripe.invoices.pay(
			invoiceId,
			{
				off_session: true,
				payment_method: a.enrollment.paymentMethodId,
				expand: ['payment_intent']
			} as Stripe.InvoicePayParams,
			key('pay')
		);
		const outcome = outcomeOf(paid);
		if (outcome !== 'declined') return { outcome, invoiceId };
		await voidQuietly(invoiceId);
		return { outcome, invoiceId, error: declineReason(paid) };
	} catch (err) {
		if (!isDecline(err)) throw err;
		await voidQuietly(invoiceId);
		return { outcome: 'declined', invoiceId, error: errorMessage(err) };
	}
}

/**
 * Settles the invoice a crashed attempt left behind: a paid or processing one is the attempt's
 * outcome; anything else is voided or deleted, and the attempt starts over with fresh keys.
 */
async function settleLeftover(invoiceId: string) {
	const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['payment_intent'] });
	if (invoice.status === 'paid') return 'succeeded' as const;
	if (invoice.status === 'open') {
		if (outcomeOf(invoice) === 'pending') return 'pending' as const;
		await stripe.invoices.voidInvoice(invoiceId);
	} else if (invoice.status === 'draft') {
		await stripe.invoices.del(invoiceId);
	}
	return 'start-over' as const;
}

/** Claims a charge for this run. Returns the claim's resume number and leftover invoice, or undefined when not ours. */
async function claim(
	ref: DocumentReference,
	planned: { uid: string; attempt: number; amountCents: number; feeCents: number },
	cycleKey: string,
	token: string,
	now: Date
) {
	const today = businessToday(now);
	return adminDB.runTransaction(async (tx) => {
		const existing = (await tx.get(ref)).data() as ChargeRecord | undefined;
		const continuing = existing?.state === 'claimed' && isStaleCharge(existing, now);
		if (existing) {
			const retry =
				existing.state === 'failed' &&
				existing.lastAttemptDay < today &&
				existing.attempts < MAX_ATTEMPTS;
			if (!retry && !continuing) return undefined;
		}
		const record: ChargeRecord = {
			uid: planned.uid,
			cycleKey,
			state: 'claimed',
			attempts: planned.attempt,
			lastAttemptDay: today,
			claimedAt: now.toISOString(),
			claimToken: token,
			resume: continuing ? (existing!.resume ?? 0) : 0,
			amountCents: planned.amountCents,
			feeCents: planned.feeCents,
			invoiceId: continuing ? (existing!.invoiceId ?? null) : null,
			error: null,
			failures: existing?.failures ?? [],
			gaveUpDay: null,
			recordedAt: null
		};
		tx.set(ref, record);
		return { resume: record.resume ?? 0, leftover: record.invoiceId ?? null };
	});
}

/** Records how a claimed charge ended, unless the webhook already settled it. */
async function finish(
	ref: DocumentReference,
	token: string,
	update: Omit<Partial<ChargeRecord>, 'failures'> & { failures?: unknown }
) {
	await adminDB.runTransaction(async (tx) => {
		const current = (await tx.get(ref)).data() as ChargeRecord | undefined;
		if (current?.state !== 'claimed' || current.claimToken !== token) return;
		tx.set(ref, update, { merge: true });
	});
}

const failureUpdate = (attempt: number, day: string, error: string, amountCents: number) => {
	const failure: ChargeFailure = { attempt, day, error, amountCents };
	return attempt >= MAX_ATTEMPTS
		? { state: 'gave-up' as const, gaveUpDay: day, error, failures: FieldValue.arrayUnion(failure) }
		: { state: 'failed' as const, error, failures: FieldValue.arrayUnion(failure) };
};

/**
 * Charges the enrolled tenants of a lease that has money due. A declined charge moves on to the next
 * tenant in the same run; an unexpected error stops the lease (its claim is left to be continued by
 * a later run) and is returned for the run summary.
 */
export async function chargeAutopay(
	leaseRef: DocumentReference,
	now: Date,
	token: string
): Promise<{ charges: AutopayCharge[]; warnings: string[] }> {
	const charges: AutopayCharge[] = [];
	const warnings: string[] = [];
	const enrollments = await loadEnrollments(leaseRef);
	if (enrollments.length === 0) return { charges, warnings };
	const today = businessToday(now);
	const tried = new Set<string>();

	for (let i = 0; i < enrollments.length; i++) {
		const lease = (await leaseRef.get()).data() as LeaseDoc | undefined;
		if (!lease) break;
		const [records, existing] = await Promise.all([
			loadLedgerRecords(leaseRef),
			loadCharges(leaseRef)
		]);
		const ledger = computeLedger({ lease, ...records, now });
		const plan = planAutopay({
			ledger,
			enrollments: enrollments.filter((e) => !tried.has(e.uid)),
			charges: existing,
			today,
			tenantIds: lease.tenantIds,
			isStaleClaim: (c) => isStaleCharge(c, now)
		});
		const next = plan.charges[0];
		if (!next || !plan.cycleKey) break;
		tried.add(next.uid);
		const enrollment = enrollments.find((e) => e.uid === next.uid)!;
		const customer = (await adminDB.collection('users').doc(next.uid).get()).data()?.stripeID as
			string | undefined;
		if (!customer) {
			warnings.push(
				`lease ${leaseRef.id}: tenant ${next.uid} has autopay on but no Stripe customer`
			);
			continue;
		}

		const feeCents = autopayFeeCents(enrollment.type, next.amountCents);
		const ref = chargesRef(leaseRef).doc(chargeId(plan.cycleKey, next.uid));
		const claimed = await claim(ref, { ...next, feeCents }, plan.cycleKey, token, now);
		if (!claimed) continue;

		const result: AutopayCharge = {
			leaseId: leaseRef.id,
			uid: next.uid,
			cycleKey: plan.cycleKey,
			attempt: next.attempt,
			amountCents: next.amountCents,
			feeCents,
			outcome: 'failed'
		};
		let resume = claimed.resume;
		if (claimed.leftover) {
			const settled = await settleLeftover(claimed.leftover);
			if (settled !== 'start-over') {
				await finish(ref, token, { state: settled, error: null });
				charges.push({ ...result, outcome: settled });
				continue;
			}
			resume += 1;
			await ref.set({ resume, invoiceId: null }, { merge: true });
		}

		const paid = await payInvoice({
			leaseId: leaseRef.id,
			lease,
			ledger,
			cycleKey: plan.cycleKey,
			enrollment,
			customer,
			attempt: next.attempt,
			resume,
			amountCents: next.amountCents,
			feeCents,
			chargeRef: ref
		});
		if (paid.outcome === 'declined') {
			const update = failureUpdate(next.attempt, today, paid.error ?? 'Declined', next.amountCents);
			await finish(ref, token, update);
			charges.push({ ...result, outcome: update.state, error: paid.error });
		} else {
			await finish(ref, token, { state: paid.outcome, error: null });
			charges.push({ ...result, outcome: paid.outcome });
		}
	}
	return { charges, warnings };
}

/** Whether any autopay charge on the lease is still pending (ACH settling). Read inside a transaction. */
export async function hasPendingCharge(
	leaseRef: DocumentReference,
	read: (query: Query) => Promise<QuerySnapshot>
) {
	const snapshot = await read(chargesRef(leaseRef).where('state', '==', 'pending'));
	return !snapshot.empty;
}
