import type Stripe from 'stripe';
import {
	FieldValue,
	type DocumentData,
	type DocumentReference,
	type Query,
	type QuerySnapshot
} from 'firebase-admin/firestore';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { adminDB } from './admin';
import { addDays } from './billing';
import { sendEmail } from './email';
import { renderBankPaymentFailedAdminEmail, renderBankPaymentFailedEmail } from './email-templates';
import { businessToday } from './leaseDates';
import { propertyAddress } from './leases';
import { stripe } from './stripe';

/**
 * One-time bank (ACH) payments made through Stripe Checkout, from the moment the session is created
 * until the payment settles or fails: `leases/{leaseId}/bank_payments/{bankPaymentId}`. Server-only;
 * the Firestore rules deny every client.
 *
 * States only move forward: `started` (session created) → `pending` (Checkout completed, money on
 * its way) → `succeeded` or `failed`. A paid-at-once Checkout goes straight from `started` to
 * `succeeded`. Only `pending` holds anything off: the payable amount, late fees and autopay.
 */

export type BankPaymentState = 'started' | 'pending' | 'succeeded' | 'failed';

export type BankPayment = {
	id: string;
	uid: string;
	sessionId: string | null;
	amountCents: number;
	feeCents: number;
	state: BankPaymentState;
	createdAt: string;
	/** When the tenant completed Checkout; the settled payment is dated by it. */
	startedAt?: string | null;
	/** The business day of `startedAt`. */
	startedDay: string | null;
	paymentIntentId?: string | null;
	invoiceId?: string | null;
	error?: string | null;
	failedDay?: string | null;
	tenantEmailedAt?: string | null;
	adminsEmailedAt?: string | null;
	tenantEmailClaim?: string | null;
	adminsEmailClaim?: string | null;
	updatedAt?: string;
};

/** Failure emails are retried, and the failure note shown, for this many days. */
export const FAILURE_NOTICE_DAYS = 7;

/** A pending payment with no news for this many days is checked with Stripe. */
export const PENDING_CHECK_DAYS = 7;

/** An email claim older than this belongs to a sender that died; it can be claimed again. */
const CLAIM_MINUTES = 10;

export const DEFAULT_FAILURE_REASON = 'The bank payment did not go through';

export const bankPaymentsRef = (leaseRef: DocumentReference) =>
	leaseRef.collection('bank_payments');

/** The lease a bank payment record belongs to (`leases/{leaseId}/bank_payments/{id}`). */
export const leaseRefOfBankPayment = (ref: DocumentReference) =>
	adminDB.collection('leases').doc(ref.path.split('/')[1]);

/** A bank payment id is one path segment of our own making. */
export const isBankPaymentId = (value: unknown): value is string =>
	typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);

export async function loadBankPayments(leaseRef: DocumentReference): Promise<BankPayment[]> {
	const snapshot = await bankPaymentsRef(leaseRef).get();
	return snapshot.docs.map((doc) => ({ ...(doc.data() as Omit<BankPayment, 'id'>), id: doc.id }));
}

/** Money on its way from one-time bank payments that have not settled. */
export const bankInFlightCents = (payments: Pick<BankPayment, 'state' | 'amountCents'>[]) =>
	payments.filter((p) => p.state === 'pending').reduce((sum, p) => sum + p.amountCents, 0);

/** Whether any one-time bank payment on the lease is pending. Read inside a transaction. */
export async function hasPendingBankPayment(
	leaseRef: DocumentReference,
	read: (query: Query) => Promise<QuerySnapshot>
) {
	const snapshot = await read(bankPaymentsRef(leaseRef).where('state', '==', 'pending'));
	return !snapshot.empty;
}

/**
 * Checkout completed for a bank session. Unpaid (processing, or waiting on microdeposits) makes a
 * started payment pending; either way the day is kept, so the settled payment is dated by it. Safe
 * to call twice, from the webhook and from the success page, in any order.
 */
export async function markBankPaymentCompleted(
	ref: DocumentReference,
	update: { paid: boolean; at: Date; paymentIntentId: string | null }
): Promise<boolean> {
	return adminDB.runTransaction(async (tx) => {
		const payment = (await tx.get(ref)).data() as Omit<BankPayment, 'id'> | undefined;
		if (!payment) return false;
		const changes: Record<string, unknown> = {};
		if (!payment.startedDay) {
			changes.startedDay = businessToday(update.at);
			changes.startedAt = update.at.toISOString();
		}
		if (update.paymentIntentId && !payment.paymentIntentId) {
			changes.paymentIntentId = update.paymentIntentId;
		}
		if (payment.state === 'started' && !update.paid) changes.state = 'pending';
		if (Object.keys(changes).length === 0) return false;
		tx.set(ref, { ...changes, updatedAt: new Date().toISOString() }, { merge: true });
		return true;
	});
}

/**
 * Marks a started or pending bank payment failed. Returns false when there is nothing to change
 * (unknown, already settled or already failed), so a redelivered or late event does nothing.
 */
export async function failBankPayment(
	ref: DocumentReference,
	day: string,
	reason: string
): Promise<boolean> {
	return adminDB.runTransaction(async (tx) => {
		const payment = (await tx.get(ref)).data() as Omit<BankPayment, 'id'> | undefined;
		if (!payment || (payment.state !== 'started' && payment.state !== 'pending')) return false;
		tx.set(
			ref,
			{ state: 'failed', failedDay: day, error: reason, updatedAt: new Date().toISOString() },
			{ merge: true }
		);
		return true;
	});
}

/** Why a payment intent failed, for the emails; a generic reason when Stripe gives none. */
export async function intentFailureReason(paymentIntentId: string | null | undefined) {
	if (!paymentIntentId) return DEFAULT_FAILURE_REASON;
	try {
		const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
		return intent.last_payment_error?.message || DEFAULT_FAILURE_REASON;
	} catch {
		return DEFAULT_FAILURE_REASON;
	}
}

export const paymentIntentIdOf = (session: Stripe.Checkout.Session) =>
	typeof session.payment_intent === 'string'
		? session.payment_intent
		: (session.payment_intent?.id ?? null);

/** The bank payment a Checkout session (or invoice) is for, from its metadata. */
export function bankPaymentRefOf(metadata: Stripe.Metadata | null | undefined) {
	const leaseId = metadata?.leaseID;
	const id = metadata?.bankPaymentId;
	if (!leaseId || !/^[A-Za-z0-9_-]+$/.test(leaseId) || !isBankPaymentId(id)) return undefined;
	return bankPaymentsRef(adminDB.collection('leases').doc(leaseId)).doc(id);
}

/** Applies a completed bank Checkout session to its record. */
export async function completeBankSession(session: Stripe.Checkout.Session, at: Date) {
	const ref = bankPaymentRefOf(session.metadata);
	if (!ref) return false;
	return markBankPaymentCompleted(ref, {
		paid: session.payment_status !== 'unpaid',
		at,
		paymentIntentId: paymentIntentIdOf(session)
	});
}

/** Fails the bank payment a session or invoice is for, then sends the failure emails. */
export async function failBankSession(
	metadata: Stripe.Metadata | null | undefined,
	paymentIntentId: string | null,
	at: Date
) {
	const ref = bankPaymentRefOf(metadata);
	if (!ref) return false;
	const reason = await intentFailureReason(paymentIntentId);
	const failed = await failBankPayment(ref, businessToday(at), reason);
	if (failed) {
		// The daily job retries whatever cannot be sent now.
		await sendBankFailureEmails(ref, at).catch((err) =>
			console.error(`Could not send bank payment failure emails for ${ref.path}: ${err}`)
		);
	}
	return failed;
}

type EmailGroup = 'tenant' | 'admins';

/**
 * Claims one recipient group's failure email. Returns false when it was sent already or another
 * sender holds a fresh claim.
 */
async function claimEmail(ref: DocumentReference, group: EmailGroup, now: Date) {
	return adminDB.runTransaction(async (tx) => {
		const payment = (await tx.get(ref)).data() as Omit<BankPayment, 'id'> | undefined;
		if (!payment || payment.state !== 'failed') return false;
		if (payment[`${group}EmailedAt`]) return false;
		const claim = payment[`${group}EmailClaim`];
		const staleBefore = new Date(now.getTime() - CLAIM_MINUTES * 60_000).toISOString();
		if (claim && claim > staleBefore) return false;
		tx.set(ref, { [`${group}EmailClaim`]: now.toISOString() }, { merge: true });
		return true;
	});
}

const userName = (data: DocumentData | undefined) =>
	[data?.firstName, data?.lastName].filter((p) => typeof p === 'string' && p).join(' ') ||
	(data?.email as string | undefined) ||
	'A tenant';

/**
 * Emails the paying tenant and every admin user that a bank payment failed, each group once.
 * Returns who was emailed: the tenant's uid and/or `admins` (never email addresses). A group that cannot be sent is unclaimed for a later retry.
 */
export async function sendBankFailureEmails(ref: DocumentReference, now = new Date()) {
	const sent: string[] = [];
	const snapshot = await ref.get();
	const payment = snapshot.data() as Omit<BankPayment, 'id'> | undefined;
	if (!payment || payment.state !== 'failed') return sent;
	if (payment.tenantEmailedAt && payment.adminsEmailedAt) return sent;

	const leaseRef = leaseRefOfBankPayment(ref);
	const lease = (await leaseRef.get()).data();
	const property = lease?.propertyId
		? (await adminDB.collection('properties').doc(lease.propertyId).get()).data()
		: undefined;
	const tenant = (await adminDB.collection('users').doc(payment.uid).get()).data();
	const details = {
		address: propertyAddress(property),
		amountCents: payment.amountCents,
		startedDay: payment.startedDay ?? payment.createdAt.slice(0, 10),
		reason: payment.error || DEFAULT_FAILURE_REASON
	};

	const deliver = async (group: EmailGroup, send: () => Promise<string[]>) => {
		if (payment[`${group}EmailedAt`] || !(await claimEmail(ref, group, now))) return;
		try {
			sent.push(...(await send()));
			await ref.set(
				{ [`${group}EmailedAt`]: new Date().toISOString(), [`${group}EmailClaim`]: null },
				{ merge: true }
			);
		} catch (err) {
			await ref.set({ [`${group}EmailClaim`]: FieldValue.delete() }, { merge: true });
			throw err;
		}
	};

	const errors: unknown[] = [];
	await deliver('tenant', async () => {
		const to = tenant?.email as string | undefined;
		if (!to) return [];
		await sendEmail({
			to,
			...renderBankPaymentFailedEmail({ ...details, link: `${PUBLIC_FRONTEND_URL}/payment` })
		});
		return [payment.uid];
	}).catch((err) => errors.push(err));
	await deliver('admins', async () => {
		const admins = await adminDB.collection('users').where('permissions', '==', 'admin').get();
		const emails = admins.docs
			.map((doc) => doc.data().email as string | undefined)
			.filter((email): email is string => Boolean(email));
		const content = renderBankPaymentFailedAdminEmail({
			...details,
			tenant: userName(tenant),
			link: lease?.propertyId
				? `${PUBLIC_FRONTEND_URL}/admin/properties/${lease.propertyId}/leases/${leaseRef.id}`
				: `${PUBLIC_FRONTEND_URL}/admin/properties`
		});
		// All or nothing: a failed send leaves the group unsent, and a retry emails every admin again.
		await Promise.all(emails.map((to) => sendEmail({ to, ...content })));
		return emails.length > 0 ? ['admins'] : [];
	}).catch((err) => errors.push(err));
	if (errors.length > 0) throw errors[0];
	return sent;
}

/**
 * The daily job's part: fails pending payments Stripe says failed (a lost event), and retries
 * failure emails that were not sent. Problems become warnings; nothing here stops the run.
 */
export async function checkBankPayments(
	leaseRef: DocumentReference,
	now: Date
): Promise<{ emailed: string[]; warnings: string[] }> {
	const today = businessToday(now);
	const emailed: string[] = [];
	const warnings: string[] = [];
	const payments = await loadBankPayments(leaseRef);
	for (const payment of payments) {
		const ref = bankPaymentsRef(leaseRef).doc(payment.id);
		try {
			if (
				payment.state === 'pending' &&
				addDays(payment.startedDay ?? payment.createdAt.slice(0, 10), PENDING_CHECK_DAYS) <= today
			) {
				if (!payment.paymentIntentId) continue;
				const intent = await stripe.paymentIntents.retrieve(payment.paymentIntentId);
				if (intent.status === 'requires_payment_method' || intent.status === 'canceled') {
					const reason = intent.last_payment_error?.message || DEFAULT_FAILURE_REASON;
					if (await failBankPayment(ref, today, reason)) {
						emailed.push(...(await sendBankFailureEmails(ref, now)));
					}
				}
				// Succeeded is left to the webhook, which records it; processing stays pending.
				continue;
			}
			if (
				payment.state === 'failed' &&
				(!payment.tenantEmailedAt || !payment.adminsEmailedAt) &&
				payment.failedDay &&
				addDays(payment.failedDay, FAILURE_NOTICE_DAYS) >= today
			) {
				emailed.push(...(await sendBankFailureEmails(ref, now)));
			}
		} catch (err) {
			warnings.push(
				`lease ${leaseRef.id}: bank payment ${payment.id}: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}
	return { emailed, warnings };
}
