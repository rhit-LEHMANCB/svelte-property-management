import { error, json } from '@sveltejs/kit';
import type Stripe from 'stripe';
import type { RequestHandler } from './$types';
import { getUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { adminDB } from '$lib/server/admin';
import { publicEnrollment, type Enrollment } from '$lib/server/autopay';
import { autopayOffRef, enrollmentRef, tenantLeaseOrError } from '$lib/server/autopayStore';
import { stripe } from '$lib/server/stripe';

/** The saved method's type and display details, or undefined for a type autopay does not take. */
function methodDetails(method: Stripe.PaymentMethod) {
	if (method.type === 'card' && method.card) {
		return { type: 'card' as const, brand: method.card.brand, last4: method.card.last4 };
	}
	if (method.type === 'us_bank_account' && method.us_bank_account) {
		return {
			type: 'us_bank_account' as const,
			brand: method.us_bank_account.bank_name ?? 'Bank account',
			last4: method.us_bank_account.last4 ?? ''
		};
	}
	return undefined;
}

/**
 * Finishes autopay setup after the tenant returns from Checkout: checks that the session is theirs,
 * for a lease they are on, and complete, then saves the enrollment. Completing the same session
 * again changes nothing, so a reload or a second tab is harmless.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const uid = getUserIdOrError(locals.userID);
	const userData = await getUserDataOrError(uid);
	const { sessionId } = await request.json().catch(() => ({}));
	if (typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
		throw error(400, 'A setup session is required');
	}

	let session: Stripe.Checkout.Session;
	try {
		session = await stripe.checkout.sessions.retrieve(sessionId, {
			expand: ['setup_intent.payment_method']
		});
	} catch {
		throw error(400, 'This setup session could not be found');
	}

	const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
	if (session.mode !== 'setup' || session.metadata?.uid !== uid || customer !== userData.stripeID) {
		throw error(403, 'This setup session is not yours.');
	}
	const { leaseId, leaseRef } = await tenantLeaseOrError(session.metadata?.leaseID, uid);

	const setupIntent = session.setup_intent as Stripe.SetupIntent | null;
	const method = setupIntent?.payment_method as Stripe.PaymentMethod | null | undefined;
	if (session.status !== 'complete' || !method || typeof method === 'string') {
		throw error(400, 'Autopay setup is not finished yet.');
	}
	const details = methodDetails(method);
	if (!details) throw error(400, 'Autopay takes a card or a bank account.');

	const amount = session.metadata?.amountCents;
	const amountCents = amount && /^\d+$/.test(amount) ? Number(amount) : null;
	const ref = enrollmentRef(leaseRef, uid);
	const offRef = autopayOffRef(leaseRef, uid);
	const startedAt = session.created * 1000;
	const saved = await adminDB.runTransaction(async (tx) => {
		const [existingDoc, offDoc] = await Promise.all([tx.get(ref), tx.get(offRef)]);
		const existing = existingDoc.data() as Omit<Enrollment, 'uid'> | undefined;
		// A return link used again (a bookmark, the browser history) must not undo what the tenant did
		// since: completing the same session twice changes nothing, a session started before the
		// current method was saved does not replace it, and one started before autopay was turned
		// off does not turn it back on.
		const offAt = (offDoc.data() as { offAt?: string } | undefined)?.offAt;
		if (!existing && offAt && startedAt < Date.parse(offAt)) return 'stale';
		const methodSavedAt = existing?.methodUpdatedAt ?? existing?.enrolledAt;
		const older = methodSavedAt !== undefined && startedAt < Date.parse(methodSavedAt);
		if (existing && (existing.setupSessionId === sessionId || older)) return { ...existing, uid };
		const now = new Date().toISOString();
		const enrollment: Omit<Enrollment, 'uid'> = {
			paymentMethodId: method.id,
			...details,
			amountCents,
			// Re-enrolling replaces the method but keeps the tenant's place in the charge order.
			enrolledAt: existing?.enrolledAt ?? now,
			setupSessionId: sessionId,
			methodUpdatedAt: now,
			updatedAt: now
		};
		tx.set(ref, enrollment);
		return { ...enrollment, uid };
	});

	if (saved === 'stale') {
		throw error(409, 'This setup link is from before you turned autopay off. Set it up again.');
	}
	return json({ leaseId, enrollment: publicEnrollment(saved) });
};
