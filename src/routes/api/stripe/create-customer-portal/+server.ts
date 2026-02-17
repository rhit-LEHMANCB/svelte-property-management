import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stripe } from '$lib/server/stripe';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { getUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';

export const GET: RequestHandler = async ({ locals }) => {
	const userId = getUserIdOrError(locals.userID);

	const userData = await getUserDataOrError(userId);

	if (!userData.stripeID) {
		throw error(400, 'No Stripe Customer ID found for user');
	}

	const session = await stripe.billingPortal.sessions.create({
		customer: userData.stripeID,
		return_url: `${PUBLIC_FRONTEND_URL}/payment`
	});

	if (session.url) {
		return json({ url: session.url });
	} else {
		throw error(500, 'Failed to create checkout session');
	}
};
