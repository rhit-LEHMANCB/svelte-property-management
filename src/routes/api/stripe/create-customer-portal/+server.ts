import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDB } from '$lib/server/admin';
import { stripe } from '$lib/server/stripe';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}

	const userData = (await adminDB.collection('users').doc(locals.userID).get()).data();

	if (!userData) {
		throw error(401, 'Failed to retrieve user details');
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
