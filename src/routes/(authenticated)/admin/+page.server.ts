import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
	await getAdminUserDataOrError(getUserIdOrError(locals.userID));
	return {};
}) satisfies PageServerLoad;
