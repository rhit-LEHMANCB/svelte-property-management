import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { waiveLateFee } from '$lib/server/leaseActions';

/** Waives one month's late fee on a lease (admins only). */
export const POST: RequestHandler = async ({ params, locals }) => {
	const userId = getUserIdOrError(locals.userID);
	await getAdminUserDataOrError(userId);

	const outcome = await waiveLateFee(params.leaseId, params.month, userId);
	if (outcome === 'missing-lease') throw error(404, 'Lease not found');
	if (outcome === 'no-fee') throw error(404, 'No late fee was charged for that month');
	return json({ status: 'Late fee waived' });
};
