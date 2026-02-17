import { adminDB } from '$lib/server/admin';
import type { PageServerLoad } from './$types';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';

export const load = (async (event) => {
	const userId = getUserIdOrError(event.locals.userID);
	await getAdminUserDataOrError(userId);

	const usersRef = adminDB.collection('users');
	const users = await usersRef.orderBy('lastName').get();

	return {
		users: users.docs.map((user) => {
			return { id: user.id, data: user.data() };
		})
	};
}) satisfies PageServerLoad;
