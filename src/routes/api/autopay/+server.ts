import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { adminDB } from '$lib/server/admin';
import { parseAmountCents, publicEnrollment, type Enrollment } from '$lib/server/autopay';
import { enrollmentRef, tenantLeaseOrError } from '$lib/server/autopayStore';

/** The caller's own enrollment on a lease; another tenant's is never reachable from here. */
async function ownEnrollmentRef(request: Request, uid: string) {
	const body = await request.json().catch(() => ({}));
	const { leaseRef } = await tenantLeaseOrError(body?.leaseId, uid);
	return { body, ref: enrollmentRef(leaseRef, uid) };
}

/** Changes the amount of the caller's enrollment: a dollar amount, or null for the full balance. */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	const uid = getUserIdOrError(locals.userID);
	const { body, ref } = await ownEnrollmentRef(request, uid);
	if (!('amount' in (body ?? {}))) throw error(400, 'An amount (or null) is required');
	const amountCents = body.amount === null ? null : parseAmountCents(body.amount);
	if (amountCents === undefined) {
		throw error(400, 'Amount must be greater than 0 and have at most two decimal places');
	}

	const saved = await adminDB.runTransaction(async (tx) => {
		const existing = (await tx.get(ref)).data() as Omit<Enrollment, 'uid'> | undefined;
		if (!existing) return undefined;
		const updated = { ...existing, amountCents, updatedAt: new Date().toISOString() };
		tx.set(ref, updated);
		return { ...updated, uid };
	});
	if (!saved) throw error(404, 'You do not have autopay on for this lease.');
	return json({ enrollment: publicEnrollment(saved) });
};

/** Turns autopay off for the caller on a lease. Charges already pending stay recorded. */
export const DELETE: RequestHandler = async ({ request, locals }) => {
	const uid = getUserIdOrError(locals.userID);
	const { ref } = await ownEnrollmentRef(request, uid);
	if (!(await ref.get()).exists) throw error(404, 'You do not have autopay on for this lease.');
	await ref.delete();
	return new Response(null, { status: 204 });
};
