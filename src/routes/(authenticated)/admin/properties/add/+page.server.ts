import type { PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms/server';
import { adminDB } from '$lib/server/admin';
import { propertySchema } from '$lib/schemas';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';

export const load = (async (event) => {
	const userId = getUserIdOrError(event.locals.userID);
	await getAdminUserDataOrError(userId);

	const form = await superValidate(propertySchema);
	return {
		form
	};
}) satisfies PageServerLoad;

export const actions = {
	basicInfo: async (event) => {
		const form = await superValidate(event, propertySchema);

		const userId = getUserIdOrError(event.locals.userID);
		await getAdminUserDataOrError(userId);

		if (!form.valid) {
			return message(form, 'Invalid form');
		}

		const newDoc = await adminDB.collection('properties').add(form.data);
		return message(form, `id${newDoc.id}`);
	}
};
