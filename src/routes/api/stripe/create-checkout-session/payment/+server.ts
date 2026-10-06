import { stripe } from '$lib/server/stripe';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDB } from '$lib/server/admin';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { getUserDataOrError } from '$lib/server/authHelpers';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { loadBalance } from '$lib/server/balance';

export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = getUserIdOrError(locals.userID);

	const userData = await getUserDataOrError(userId);

	const { amount } = await request.json();

	if (!amount || typeof amount != 'number') {
		throw error(400, 'Amount must be a provided number for the amount to charge');
	}

	// Whole cents only: more than two decimals would be silently rounded into a different charge.
	const amountCents = Math.round(amount * 100);
	if (amountCents <= 0 || Math.abs(amount * 100 - amountCents) > 1e-6) {
		throw error(400, 'Amount must be greater than 0 and have at most two decimal places');
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

	const moveInMonth: string | undefined = userJunctionsQuery.docs[0].data().moveInMonth;
	const { balanceCents } = await loadBalance(userProperty.id, userPropertyData.rent, moveInMonth);
	if (amountCents > balanceCents) {
		throw error(400, 'Amount is greater than the balance owed');
	}

	const feeCents = Math.round(amountCents * 0.029 + 30);

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
					unit_amount: amountCents
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
					unit_amount: feeCents
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
					propertyID: userProperty.id,
					rentCents: String(amountCents),
					feeCents: String(feeCents),
					// The webhook uses it to apply the payment to the oldest unpaid months first.
					...(moveInMonth && { moveInMonth })
				}
			}
		},
		success_url: `${PUBLIC_FRONTEND_URL}/payment/success`,
		cancel_url: `${PUBLIC_FRONTEND_URL}/payment`
	});

	if (session.url) {
		return json({ url: session.url });
	} else {
		throw error(500, 'Failed to create checkout session');
	}
};
