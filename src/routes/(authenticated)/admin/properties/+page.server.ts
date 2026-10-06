import { adminDB } from '$lib/server/admin';
import type { PageServerLoad } from './$types';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';

export const load = (async (event) => {
	const userId = getUserIdOrError(event.locals.userID);
	await getAdminUserDataOrError(userId);

	const propertiesRef = adminDB.collection('properties');
	const properties = await propertiesRef.orderBy('title').get();

	return {
		properties: properties.docs.map((property) => {
			return { id: property.id, data: property.data() };
		})
	};
}) satisfies PageServerLoad;
