import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { STRIPE_ENDPOINT_SECRET } from '$env/static/private';
import { stripe } from '$lib/server/stripe';
import type { Stripe } from 'stripe';
import { adminDB } from '$lib/server/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMonthKey } from '$lib/server/payments';

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
				console.log('Could not find rent payment amount');
				break;
			}

			const amount = rentCents / 100;
			const eventDate = Timestamp.fromMillis(invoice.created * 1000);
			const { year, monthName } = getMonthKey(eventDate.toDate());
			const transaction = {
				date: eventDate,
				amount,
				...(feeCents !== undefined && { fee: feeCents / 100 })
			};

			// Any failure below responds 500 so that Stripe redelivers the event.
			try {
				const propertyDoc = adminDB.collection('properties').doc(propertyId);
				const currentYearDocument = propertyDoc.collection('payment_history').doc(String(year));
				const currentYearData = (await currentYearDocument.get()).data();

				let remainingBalance: number | FieldValue;
				if (currentYearData && currentYearData[monthName]) {
					remainingBalance = FieldValue.increment(-1 * amount);
				} else {
					const propertyData = (await propertyDoc.get()).data();

					if (!propertyData) {
						console.log('Could not find property details');
						break;
					}
					remainingBalance = propertyData.rent - amount;
				}

				await currentYearDocument.set(
					{
						[monthName]: {
							remainingBalance,
							transactions: FieldValue.arrayUnion(transaction)
						}
					},
					{ merge: true }
				);
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
