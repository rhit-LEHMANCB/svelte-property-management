import { error, json } from '@sveltejs/kit';
import type Stripe from 'stripe';
import type { RequestHandler } from './$types';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { getUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { parseAmountCents } from '$lib/server/autopay';
import { tenantLeaseOrError } from '$lib/server/autopayStore';
import { stripe } from '$lib/server/stripe';

/**
 * Starts autopay setup: a Stripe Checkout session in setup mode that saves a card or bank account
 * to the tenant's customer. Card and bank details stay on Stripe; the tenant comes back to
 * `/payment?autopay_session=...`, which completes the enrollment.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const uid = getUserIdOrError(locals.userID);
	const userData = await getUserDataOrError(uid);
	const { leaseId, amount } = await request.json();

	const { lease } = await tenantLeaseOrError(leaseId, uid);

	// No amount (or null) means whatever is owed.
	const amountCents = amount === undefined || amount === null ? null : parseAmountCents(amount);
	if (amountCents === undefined) {
		throw error(400, 'Amount must be greater than 0 and have at most two decimal places');
	}
	if (!userData.stripeID) {
		throw error(400, 'Your account has no payment profile yet. Please contact us.');
	}

	const metadata = {
		leaseID: leaseId as string,
		propertyID: lease.propertyId,
		uid,
		amountCents: amountCents === null ? '' : String(amountCents)
	};
	const params = (types: string[]) =>
		({
			mode: 'setup',
			customer: userData.stripeID,
			currency: 'usd',
			// The pinned API version (see stripe.ts) takes `payment_method_types`; the SDK's types follow
			// the newest version, which dropped it, hence the cast.
			payment_method_types: types,
			metadata,
			setup_intent_data: { metadata },
			success_url: `${PUBLIC_FRONTEND_URL}/payment?autopay_session={CHECKOUT_SESSION_ID}`,
			cancel_url: `${PUBLIC_FRONTEND_URL}/payment`
		}) as Stripe.Checkout.SessionCreateParams;
	let session: Stripe.Checkout.Session;
	try {
		session = await stripe.checkout.sessions.create(params(['card', 'us_bank_account']));
	} catch (err) {
		// An account without ACH Direct Debit turned on refuses `us_bank_account`; cards still work.
		const e = err as { param?: string; message?: string };
		if (e?.param !== 'payment_method_types' && !/us_bank_account/.test(e?.message ?? '')) throw err;
		console.warn('ACH Direct Debit is not enabled in Stripe; autopay setup offers cards only.');
		session = await stripe.checkout.sessions.create(params(['card']));
	}

	if (!session.url) throw error(500, 'Failed to create the autopay setup session');
	return json({ url: session.url });
};
