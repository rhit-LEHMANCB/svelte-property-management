import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { STRIPE_ENDPOINT_SECRET } from '$env/static/private';
import { stripe } from '$lib/server/stripe';
import type { Stripe } from 'stripe';
import { adminDB } from '$lib/server/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

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
			const invoicePaymentSucceeded = event.data.object;
			if (!invoicePaymentSucceeded.metadata) {
				console.log('No metadata provided');
				break;
			}

			let amount = invoicePaymentSucceeded.lines.data.find(
				(line) => line.description === 'Rent'
			)?.amount;

			if (!amount) {
				console.log('Could not find rent payment amount');
				break;
			}

			amount = amount / 100;
			const eventDate = Timestamp.fromMillis(invoicePaymentSucceeded.created * 1000);
			const curMonthString = eventDate.toDate().toLocaleString('en-us', { month: 'long' });
			const curYearString = eventDate.toDate().toLocaleString('en-us', { year: 'numeric' });

			const propertyDoc = adminDB
				.collection('properties')
				.doc(invoicePaymentSucceeded.metadata.propertyID);
			const currentYearDocument = propertyDoc.collection('payment_history').doc(curYearString);

			const currentYearData = (await currentYearDocument.get()).data();

			if (currentYearData && currentYearData[curMonthString]) {
				currentYearDocument
					.set(
						{
							[curMonthString]: {
								remainingBalance: FieldValue.increment(-1 * amount),
								transactions: FieldValue.arrayUnion({
									date: eventDate,
									amount: amount
								})
							}
						},
						{ merge: true }
					)
					.catch((err) => {
						throw error(500, err);
					});
			} else {
				const propertyData = (await propertyDoc.get()).data();

				if (!propertyData) {
					console.log('Could not find property details');
					break;
				}

				currentYearDocument
					.set(
						{
							[curMonthString]: {
								remainingBalance: propertyData.rent - amount,
								transactions: FieldValue.arrayUnion({
									date: eventDate,
									amount: amount
								})
							}
						},
						{ merge: true }
					)
					.catch((err) => {
						throw error(500, err);
					});
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
