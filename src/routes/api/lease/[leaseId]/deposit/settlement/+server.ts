import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { settleDeposit } from '$lib/server/leaseActions';

/**
 * Records or replaces the settlement of a lease's deposit (admins only): `{ returned, deductions:
 * [{ amount, reason }] }`, in dollars.
 */
export const PUT: RequestHandler = async ({ params, locals, request }) => {
	const userId = getUserIdOrError(locals.userID);
	await getAdminUserDataOrError(userId);

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') throw error(400, 'Send the settlement as JSON');

	const result = await settleDeposit(params.leaseId, body, userId);
	switch (result.kind) {
		case 'missing-lease':
			throw error(404, 'Lease not found');
		case 'not-ended':
			throw error(409, 'A deposit can be settled only after the lease has ended.');
		case 'invalid':
			return json({ errors: result.errors }, { status: 400 });
		case 'settled':
			return json({ settlement: result.settlement });
	}
};
