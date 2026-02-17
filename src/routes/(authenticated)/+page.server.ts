import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';

export const load = (async ({ locals }) => {
	const uid = getUserIdOrError(locals.userID);
	const userData = await getUserDataOrError(uid);

	if (userData.permissions === 'admin') {
		throw redirect(303, '/admin');
	}
	return {};
}) satisfies PageServerLoad;
