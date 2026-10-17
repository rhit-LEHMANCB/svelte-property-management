import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { STRIPE_ENDPOINT_SECRET } from '$env/static/private';
import { stripe } from '$lib/server/stripe';
import type { Stripe } from 'stripe';
import { adminDB } from '$lib/server/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { depositRef, loadLedgerRecords } from '$lib/server/balance';
import {
	allocate,
	computeLedger,
	monthCharge,
	monthPaidCents,
	toCents,
	type MonthEntry
} from '$lib/server/billing';
import { businessToday, leaseStatus, type LeaseDoc } from '$lib/server/leaseDates';
import { leasesOfTenant } from '$lib/server/leases';
import { chargeId, type ChargeRecord } from '$lib/server/autopay';
import { declineReason, failPendingCharge } from '$lib/server/autopayCharge';
import { chargesRef } from '$lib/server/autopayStore';
import {
	bankPaymentRefOf,
	completeBankSession,
	failBankSession,
	paymentIntentIdOf,
	type BankPayment
} from '$lib/server/bankPayments';

/**
 * The autopay charge record an invoice was made for, or undefined for any other invoice (Checkout,
 * or created before autopay existed).
 */
function autopayChargeRef(invoice: Stripe.Invoice, leaseId: string) {
	const { autopay, cycleKey, uid } = invoice.metadata ?? {};
	if (autopay !== 'true' || !cycleKey || !uid) return undefined;
	return chargesRef(adminDB.collection('leases').doc(leaseId)).doc(chargeId(cycleKey, uid));
}

/**
 * Why an autopay invoice's payment failed, from its payment intent (the event's invoice carries only
 * the intent's id). The tenant's failure email quotes it.
 */
async function failureReason(invoiceId: string | undefined) {
	if (!invoiceId) return 'The payment did not go through';
	try {
		return declineReason(await stripe.invoices.retrieve(invoiceId, { expand: ['payment_intent'] }));
	} catch {
		return 'The payment did not go through';
	}
}

const wholeCents = (value: string | undefined) =>
	value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined;

/**
 * What a paid invoice paid, in cents, without the transaction fee. Invoices created by the app carry
 * the parts in their metadata; ones from before deposits and late fees carry only `rentCents` and
 * are all rent (`rentOnly`); older ones fall back to the line items by description.
 */
function readAmounts(invoice: Stripe.Invoice) {
	const metadata = invoice.metadata ?? {};
	const feeCents = wholeCents(metadata.feeCents);
	const rentCents = wholeCents(metadata.rentCents);
	const depositCents = wholeCents(metadata.depositCents);
	const lateFeeCents = wholeCents(metadata.lateFeeCents);
	if (depositCents !== undefined || lateFeeCents !== undefined) {
		return {
			totalCents: (rentCents ?? 0) + (depositCents ?? 0) + (lateFeeCents ?? 0),
			feeCents,
			rentOnly: false
		};
	}
	if (rentCents) return { totalCents: rentCents, feeCents, rentOnly: true };
	const line = (description: string) =>
		invoice.lines.data.find((l) => l.description === description)?.amount;
	return { totalCents: line('Rent'), feeCents: line('Transaction Fee'), rentOnly: true };
}

/**
 * The lease an invoice pays for. Invoices carry `leaseID`; ones created before leases existed carry
 * only `propertyID`, and are recorded against the paying customer's lease at that property that was
 * current when the invoice was created.
 */
async function leaseIdOf(invoice: Stripe.Invoice): Promise<string | undefined> {
	const leaseId = invoice.metadata?.leaseID;
	if (leaseId) return leaseId;

	const propertyId = invoice.metadata?.propertyID;
	const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
	if (!propertyId || !customerId) return undefined;

	const payer = await adminDB
		.collection('users')
		.where('stripeID', '==', customerId)
		.limit(1)
		.get();
	if (payer.empty) return undefined;
	const day = businessToday(new Date(invoice.created * 1000));
	const [match] = (await leasesOfTenant(payer.docs[0].id))
		.filter(([, lease]) => lease.propertyId === propertyId && leaseStatus(lease, day) === 'current')
		.sort(([, a], [, b]) => b.startDate.localeCompare(a.startDate));
	return match?.[0];
}

export const POST: RequestHandler = async ({ request }) => {
	const sig = request.headers.get('stripe-signature');

	if (!sig) {
		throw error(400, 'Stripe sig is required');
	}

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(
			Buffer.from(await request.arrayBuffer()),
			sig,
			STRIPE_ENDPOINT_SECRET
		);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} catch (err: any) {
		console.log(err.message);
		throw error(400, `Webhook Error: ${err.message}`);
	}

	// Handle the event
	switch (event.type) {
		case 'invoice.payment_succeeded': {
			const invoice = event.data.object;
			if (!invoice.metadata?.leaseID && !invoice.metadata?.propertyID) {
				console.log('No lease or property in invoice metadata');
				break;
			}

			const { totalCents, feeCents, rentOnly } = readAmounts(invoice);
			if (!totalCents) {
				console.error('Could not find the payment amount');
				break;
			}

			const eventDate = Timestamp.fromMillis(invoice.created * 1000);
			// Enough to find and record a payment by hand when it cannot be recorded here.
			const unrecorded = (reason: string) =>
				console.error(
					`UNRECORDED PAYMENT: ${reason}. invoice=${invoice.id} customer=${
						typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
					} lease=${invoice.metadata?.leaseID ?? '-'} property=${invoice.metadata?.propertyID ?? '-'} totalCents=${totalCents} feeCents=${feeCents ?? '-'}`
				);

			// Any failure below responds 500 so that Stripe redelivers the event. Everything is read and
			// written in one transaction: concurrent events cannot overwrite each other, a payment
			// spanning two years is recorded completely or not at all, and the invoice is marked as
			// recorded in the same commit, so a redelivery never counts a payment twice.
			try {
				const leaseId = await leaseIdOf(invoice);
				if (!leaseId) {
					// A pre-lease invoice with no lease to match; a retry cannot change that.
					unrecorded('no lease matches this invoice');
					break;
				}
				const leaseRef = adminDB.collection('leases').doc(leaseId);
				const outcome = await adminDB.runTransaction(async (tx) => {
					const recordedRef = invoice.id
						? leaseRef.collection('recorded_invoices').doc(invoice.id)
						: undefined;
					if (recordedRef && (await tx.get(recordedRef)).exists) {
						return 'already-recorded';
					}

					const lease = (await tx.get(leaseRef)).data() as LeaseDoc | undefined;
					if (!lease) {
						return 'unknown-lease';
					}
					// An autopay charge is marked succeeded in the same commit that records its payment.
					const chargeRef = autopayChargeRef(invoice, leaseId);
					const charge = chargeRef
						? ((await tx.get(chargeRef)).data() as ChargeRecord | undefined)
						: undefined;
					// A one-time bank payment is marked succeeded in the same commit, and dated when the
					// tenant completed Checkout rather than when it settled days later.
					const bankRef =
						invoice.metadata?.leaseID === leaseId ? bankPaymentRefOf(invoice.metadata) : undefined;
					const bank = bankRef
						? ((await tx.get(bankRef)).data() as Omit<BankPayment, 'id'> | undefined)
						: undefined;
					// Without a start time (the completion event and the success page both missed it), the
					// session's creation is the closest to when the tenant paid.
					const startedAt = bank?.startedAt ?? bank?.createdAt;
					const paidAt = startedAt ? Timestamp.fromDate(new Date(startedAt)) : eventDate;

					// The payment goes to late fees, then the deposit, then the oldest unpaid rent, against
					// what the lease owed when the invoice was created.
					const now = paidAt.toDate();
					const records = await loadLedgerRecords(leaseRef, {
						doc: (ref) => tx.get(ref),
						collection: (ref) => tx.get(ref)
					});
					const ledger = computeLedger({ lease, ...records, now });
					const allocation = allocate(ledger, lease, totalCents, { rentOnly });

					// The transaction fee is recorded once, on the first transaction of the payment.
					let feePending = feeCents !== undefined;
					const transaction = (cents: number, extra: Record<string, unknown> = {}) => {
						const entry = {
							date: paidAt,
							amount: cents / 100,
							...extra,
							...(feePending && { fee: feeCents! / 100 })
						};
						feePending = false;
						return entry;
					};

					for (const part of allocation.lateFees) {
						const row = ledger.lateFees.find((f) => f.month.key === part.month.key)!;
						tx.set(
							leaseRef.collection('late_fees').doc(part.month.key),
							{
								amount: row.amountCents / 100,
								paid: (row.paidCents + part.cents) / 100,
								transactions: FieldValue.arrayUnion(
									transaction(part.cents, { invoiceId: invoice.id ?? null })
								)
							},
							{ merge: true }
						);
					}

					if (allocation.depositCents > 0) {
						tx.set(
							depositRef(leaseRef),
							{
								paid: (ledger.deposit.paidCents + allocation.depositCents) / 100,
								transactions: FieldValue.arrayUnion(
									transaction(allocation.depositCents, { invoiceId: invoice.id ?? null })
								)
							},
							{ merge: true }
						);
					}

					// Rent: one entry per month, grouped by year document. `remainingBalance` is what the
					// month still owes after this payment; the transactions are the record.
					const rentCents = toCents(lease.rent);
					const years = new Map<string, Record<string, unknown>>();
					for (const part of allocation.rent) {
						const year = String(part.month.year);
						const entry = records.histories[year]?.[part.month.monthName] as MonthEntry | undefined;
						const paidBefore = monthPaidCents(entry, rentCents);
						const charge = monthCharge(lease, part.month);
						const added: Record<string, unknown>[] = [];
						// An entry from before transactions were the record keeps its paid amount as one.
						const legacy =
							paidBefore > 0 &&
							!(entry?.transactions ?? []).some(
								(t) => typeof t.amount === 'number' && t.amount !== 0
							);
						if (legacy) added.push({ amount: paidBefore / 100, legacy: true });
						added.push(transaction(part.cents));
						const months = years.get(year) ?? {};
						months[part.month.monthName] = {
							remainingBalance: (charge - paidBefore - part.cents) / 100,
							transactions: FieldValue.arrayUnion(...added)
						};
						years.set(year, months);
					}
					for (const [year, months] of years) {
						tx.set(leaseRef.collection('payment_history').doc(year), months, { merge: true });
					}
					if (recordedRef) {
						tx.set(recordedRef, { recordedAt: eventDate });
					}
					if (bankRef && bank && bank.state !== 'succeeded') {
						if (bank.state === 'failed') {
							// The money arrived after all; it is recorded, and the failure no longer applies.
							console.error(
								`Bank payment ${bankRef.path} was marked failed but its invoice ${invoice.id} was paid`
							);
						}
						tx.set(
							bankRef,
							{
								state: 'succeeded',
								invoiceId: invoice.id ?? null,
								updatedAt: new Date().toISOString()
							},
							{ merge: true }
						);
					}
					if (chargeRef && charge && (!charge.invoiceId || charge.invoiceId === invoice.id)) {
						tx.set(
							chargeRef,
							{ state: 'succeeded', recordedAt: new Date().toISOString(), error: null },
							{ merge: true }
						);
					}
					return 'recorded';
				});

				if (outcome === 'unknown-lease') {
					// The money was taken, so fail loudly: Stripe retries and flags the failing deliveries.
					unrecorded('the lease this invoice names does not exist');
					throw new Error('The lease for this invoice does not exist');
				} else if (outcome === 'already-recorded') {
					console.log('Invoice already recorded; ignoring redelivery');
				}
			} catch (err) {
				console.log(err instanceof Error ? err.message : err);
				throw error(500, 'Failed to record payment');
			}
			break;
		}
		case 'checkout.session.completed':
		case 'checkout.session.async_payment_succeeded': {
			// A one-time bank payment: completed but unpaid means pending until it settles. Settling is
			// recorded by `invoice.payment_succeeded`; here only the start day is kept if it is missing.
			const session = event.data.object;
			if (!bankPaymentRefOf(session.metadata)) {
				console.log(`Not a bank payment session; ignoring ${event.type}`);
				break;
			}
			try {
				await completeBankSession(session, new Date(event.created * 1000));
			} catch (err) {
				console.log(err instanceof Error ? err.message : err);
				throw error(500, 'Failed to record the bank payment');
			}
			break;
		}
		case 'checkout.session.async_payment_failed': {
			const session = event.data.object;
			if (!bankPaymentRefOf(session.metadata)) {
				console.log('Not a bank payment session; ignoring payment failure');
				break;
			}
			try {
				await failBankSession(
					session.metadata,
					paymentIntentIdOf(session),
					new Date(event.created * 1000)
				);
			} catch (err) {
				console.log(err instanceof Error ? err.message : err);
				throw error(500, 'Failed to record the bank payment failure');
			}
			break;
		}
		case 'invoice.payment_failed': {
			// An autopay charge that failed: usually ACH that did not settle. A one-time bank payment's
			// invoice is handled the same way as its Checkout session, in case it gets here.
			const invoice = event.data.object;
			const leaseId = invoice.metadata?.leaseID;
			if (bankPaymentRefOf(invoice.metadata)) {
				// Not in the current SDK's types, but present in the pinned API version.
				const intent = (invoice as unknown as { payment_intent?: string | { id: string } | null })
					.payment_intent;
				try {
					await failBankSession(
						invoice.metadata,
						typeof intent === 'string' ? intent : (intent?.id ?? null),
						new Date(event.created * 1000)
					);
				} catch (err) {
					console.log(err instanceof Error ? err.message : err);
					throw error(500, 'Failed to record the bank payment failure');
				}
				break;
			}
			const chargeRef = leaseId ? autopayChargeRef(invoice, leaseId) : undefined;
			if (!chargeRef) {
				console.log('Not an autopay invoice; ignoring payment failure');
				break;
			}
			const reason = await failureReason(invoice.id);
			const day = businessToday(new Date(event.created * 1000));
			try {
				// A pending charge for this invoice, or one the job is still making (the event can beat
				// the job's own record of the decline). A redelivery, or a charge already settled,
				// changes nothing.
				const failed = invoice.id
					? await failPendingCharge(chargeRef, invoice.id, day, reason)
					: false;
				// The tenant is emailed by the next daily run, which also retries the charge.
				if (failed && invoice.id && invoice.status === 'open') {
					await stripe.invoices.voidInvoice(invoice.id).catch((err) => {
						console.error(`Could not void failed autopay invoice ${invoice.id}: ${err?.message}`);
					});
				}
			} catch (err) {
				console.log(err instanceof Error ? err.message : err);
				throw error(500, 'Failed to record the payment failure');
			}
			break;
		}
		default: {
			console.log(`Unhandled event type ${event.type}`);
		}
	}

	// Return a 200 response to acknowledge receipt of the event
	return new Response();
};
