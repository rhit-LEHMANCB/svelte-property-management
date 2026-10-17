import type { PageServerLoad } from './$types';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { adminDB } from '$lib/server/admin';
import { stripe } from '$lib/server/stripe';
import {
	bankPaymentRefOf,
	completeBankSession,
	leaseRefOfBankPayment
} from '$lib/server/bankPayments';
import type { LeaseDoc } from '$lib/server/leaseDates';

/**
 * Back from a bank Checkout (`?bank=<session id>`): the payment is marked processing right away,
 * without waiting for Stripe's event, so `/payment` shows it and it cannot be paid twice. Only the
 * signed-in tenant's own bank session counts; anything else just shows the usual page.
 */
export const load = (async ({ locals, url }) => {
	const uid = getUserIdOrError(locals.userID);
	const sessionId = url.searchParams.get('bank');
	if (!sessionId || !/^cs_[A-Za-z0-9_]{1,250}$/.test(sessionId)) return { bank: false };

	try {
		const [session, user] = await Promise.all([
			stripe.checkout.sessions.retrieve(sessionId),
			adminDB.collection('users').doc(uid).get()
		]);
		const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
		const ref = bankPaymentRefOf(session.metadata);
		const stripeID = user.data()?.stripeID;
		if (!ref || !stripeID || customer !== stripeID || session.status !== 'complete') {
			return { bank: false };
		}
		const [payment, lease] = await Promise.all([ref.get(), leaseRefOfBankPayment(ref).get()]);
		const tenantIds = (lease.data() as LeaseDoc | undefined)?.tenantIds;
		if (payment.data()?.uid !== uid || !Array.isArray(tenantIds) || !tenantIds.includes(uid)) {
			return { bank: false };
		}
		await completeBankSession(session, new Date());
		return { bank: true };
	} catch (err) {
		// The webhook still records it; the page only loses the bank wording.
		console.error(`Could not check bank Checkout session ${sessionId}: ${err}`);
		return { bank: false };
	}
}) satisfies PageServerLoad;
