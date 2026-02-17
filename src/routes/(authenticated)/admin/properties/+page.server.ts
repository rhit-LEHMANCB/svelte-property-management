import { adminDB } from '$lib/server/admin';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async (event) => {
	const usersRef = adminDB.collection('users');

	if (!event.locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}

	const userData = (await usersRef.doc(event.locals.userID).get()).data();

	if (!userData || !userData.permissions || userData.permissions !== 'admin') {
		throw redirect(303, '/');
	}

	const propertiesRef = adminDB.collection('properties');
	const properties = await propertiesRef.orderBy('title').get();

	return {
		properties: properties.docs.map((property) => {
			return { id: property.id, data: property.data() };
		})
	};
}) satisfies PageServerLoad;
