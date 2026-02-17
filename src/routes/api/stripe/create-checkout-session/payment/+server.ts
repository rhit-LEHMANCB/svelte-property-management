import { stripe } from '$lib/server/stripe';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDB } from '$lib/server/admin';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}

	const userData = (await adminDB.collection('users').doc(locals.userID).get()).data();

	if (!userData) {
		throw error(401, 'Failed to retrieve user details');
	}
	const { amount } = await request.json();

	if (!amount || typeof amount != 'number') {
		throw error(400, 'Amount must be a provided number for the amount to charge');
	}

	const userJunctionsQuery = await adminDB
		.collection('junction_user_property')
		.where('tenantId', '==', locals.userID)
		.get();

	if (userJunctionsQuery.size !== 1) {
		throw error(
			500,
			`User is associated with wrong number of properties: ${userJunctionsQuery.size}`
		);
	}

	const userProperty = await adminDB
		.collection('properties')
		.doc(userJunctionsQuery.docs[0].data().propertyId)
		.get();

	const userPropertyData = userProperty.data();
	if (!userPropertyData) {
		throw error(500, 'Failed to find property info.');
	}

	//TODO: validate amount is not greater than remaining balance
	//if (amount > )

	const session = await stripe.checkout.sessions.create({
		customer: userData.stripeID,
		billing_address_collection: 'auto',
		payment_intent_data: {
			setup_future_usage: 'on_session'
		},
		line_items: [
			{
				price_data: {
					currency: 'usd',
					product_data: {
						name: 'Rent',
						description: `Rent payment for ${userPropertyData.streetAddress}, ${userPropertyData.city}, ${userPropertyData.state}`
					},
					unit_amount: amount * 100
				},
				// For metered billing, do not pass quantity
				quantity: 1
			},
			{
				price_data: {
					currency: 'usd',
					product_data: {
						name: 'Transaction Fee',
						description: `Transaction fee for one-time payment. Set up auto-pay to waive this fee.`
					},
					unit_amount: Math.round(amount * 100 * 0.029 + 30)
				},
				// For metered billing, do not pass quantity
				quantity: 1
			}
		],
		mode: 'payment',
		invoice_creation: {
			enabled: true,
			invoice_data: {
				metadata: {
					propertyID: userProperty.id
				}
			}
		},
		// TODO: please change these later
		success_url: `${PUBLIC_FRONTEND_URL}/`,
		cancel_url: `${PUBLIC_FRONTEND_URL}/payment`
	});

	if (session.url) {
		return json({ url: session.url });
	} else {
		throw error(500, 'Failed to create checkout session');
	}
};
