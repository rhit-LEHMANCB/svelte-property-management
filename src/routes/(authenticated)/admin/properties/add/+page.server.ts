import type { PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms/server';
import { adminDB } from '$lib/server/admin';
import { propertySchema } from '$lib/schemas';
import { error } from '@sveltejs/kit';

export const load = (async (event) => {
	if (!event.locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}
	const userData = (await adminDB.collection('users').doc(event.locals.userID).get()).data();

	if (!userData || !userData.permissions || userData.permissions !== 'admin') {
		throw error(401, 'You must be an admin to do this.');
	}

	const form = await superValidate(propertySchema);
	return {
		form
	};
}) satisfies PageServerLoad;

export const actions = {
	basicInfo: async (event) => {
		const form = await superValidate(event, propertySchema);

		if (!event.locals.userID) {
			throw error(401, 'You must be logged in to do this.');
		}

		const userData = (await adminDB.collection('users').doc(event.locals.userID).get()).data();

		if (!userData || !userData.permissions || userData.permissions !== 'admin') {
			throw error(401, 'You must be an admin to do this.');
		}

		if (!form.valid) {
			return message(form, 'Invalid form');
		}

		const newDoc = await adminDB.collection('properties').add(form.data);
		return message(form, `id${newDoc.id}`);
	}
};
