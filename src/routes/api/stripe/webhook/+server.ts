import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { STRIPE_ENDPOINT_SECRET } from '$env/static/private';
import { stripe } from '$lib/server/stripe';
import type { Stripe } from 'stripe';
import { adminDB } from '$lib/server/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { allocatePayment } from '$lib/server/payments';
import { loadHistories } from '$lib/server/balance';

const wholeCents = (value: string | undefined) =>
	value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined;

/**
 * The rent and fee of a paid invoice, in cents. Invoices created by the app carry both in their
 * metadata; invoices from before that fall back to the line items by description.
 */
function readAmounts(invoice: Stripe.Invoice) {
	const rentCents = wholeCents(invoice.metadata?.rentCents);
	if (rentCents) {
		return { rentCents, feeCents: wholeCents(invoice.metadata?.feeCents) };
	}
	const line = (description: string) =>
		invoice.lines.data.find((l) => l.description === description)?.amount;
	return { rentCents: line('Rent'), feeCents: line('Transaction Fee') };
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
			const propertyId = invoice.metadata?.propertyID;
			if (!propertyId) {
				console.log('No property in invoice metadata');
				break;
			}

			const { rentCents, feeCents } = readAmounts(invoice);
			if (!rentCents) {
				console.error('Could not find rent payment amount');
				break;
			}

			const eventDate = Timestamp.fromMillis(invoice.created * 1000);
			const moveInMonth = invoice.metadata?.moveInMonth;

			// Any failure below responds 500 so that Stripe redelivers the event.
			try {
				const propertyData = (await adminDB.collection('properties').doc(propertyId).get()).data();
				if (!propertyData) {
					console.log('Could not find property details');
					break;
				}

				// A payment clears the oldest unpaid months first, the same order the balance uses.
				const histories = await loadHistories(propertyId, moveInMonth, eventDate.toDate());
				const allocations = allocatePayment({
					rent: propertyData.rent,
					moveInMonth,
					histories,
					now: eventDate.toDate(),
					amountCents: rentCents
				});

				// One write per year document; the fee is recorded once, on the first transaction.
				const years = new Map<string, Record<string, unknown>>();
				allocations.forEach((a, index) => {
					const amount = a.cents / 100;
					const transaction = {
						date: eventDate,
						amount,
						...(index === 0 && feeCents !== undefined && { fee: feeCents / 100 })
					};
					const months = years.get(String(a.month.year)) ?? {};
					months[a.month.monthName] = {
						remainingBalance: a.hasEntry
							? FieldValue.increment(-1 * amount)
							: (propertyData.rent * 100 - a.cents) / 100,
						transactions: FieldValue.arrayUnion(transaction)
					};
					years.set(String(a.month.year), months);
				});

				for (const [year, months] of years) {
					await adminDB
						.collection('properties')
						.doc(propertyId)
						.collection('payment_history')
						.doc(year)
						.set(months, { merge: true });
				}
			} catch (err) {
				console.log(err instanceof Error ? err.message : err);
				throw error(500, 'Failed to record payment');
			}
			break;
		}
		// ... handle other event types
		default: {
			console.log(`Unhandled event type ${event.type}`);
		}
	}

	// Return a 200 response to acknowledge receipt of the event
	return new Response();
};
