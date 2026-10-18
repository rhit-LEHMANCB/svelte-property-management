import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { adminAttention } from '$lib/server/leases';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
	await getAdminUserDataOrError(getUserIdOrError(locals.userID));
	return { attention: await adminAttention() };
}) satisfies PageServerLoad;
