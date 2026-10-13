import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { deleteLease } from '$lib/server/leases';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const userId = getUserIdOrError(locals.userID);
	await getAdminUserDataOrError(userId);

	const outcome = await deleteLease(params.leaseId);
	if (outcome === 'missing') throw error(404, 'Lease not found');
	if (outcome === 'has-payments') {
		throw error(
			409,
			'This lease has recorded payments, so it cannot be deleted. Set an end date instead.'
		);
	}
	return json({ status: 'Lease deleted' });
};
