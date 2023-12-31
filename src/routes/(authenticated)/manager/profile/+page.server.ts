import type { PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms/server';
import { adminAuth, adminDB, adminStorage } from '$lib/server/admin';
import { error, fail } from '@sveltejs/kit';
import { profileSchema } from '$lib/schemas';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';

export const load = (async (event) => {
	if (!event.locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}
	const userData = (await adminDB.collection('users').doc(event.locals.userID).get()).data();

	const form = await superValidate(userData, profileSchema);
	return {
		form
	};
}) satisfies PageServerLoad;

export const actions = {
	contact: async (event) => {
		const form = await superValidate(event, profileSchema);

		if (!event.locals.userID) {
			throw error(401, 'You must be logged in to do this.');
		}

		if (!form.valid) {
			return message(form, 'Invalid form');
		}

		await adminDB.collection('users').doc(event.locals.userID).update(form.data);

		await adminAuth.updateUser(event.locals.userID, {
			email: form.data.email
		});
		return message(form, 'Form submitted');
	},
	photo: async ({ request, locals }) => {
		if (!locals.userID) {
			throw error(401, 'You must be logged in to do this.');
		}

		const data = await request.formData();
		const file = data.get('photo') as File;
		if (file.size == 0) {
			return fail(400);
		}
		const storageRef = adminStorage.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`);
		await storageRef.deleteFiles({
			prefix: `users/${locals.userID}/profile`
		});
		const ext = file.name.split('.').pop();
		const fileName = `${Date.now().toString()}.${ext}`;
		const blob = storageRef.file(`users/${locals.userID}/profile/${fileName}`);
		const blobSteam = blob.createWriteStream({ resumable: false });
		blobSteam.end(new Uint8Array(await file.arrayBuffer()));

		await adminDB
			.collection('users')
			.doc(locals.userID)
			.update({
				photoUrl: `https://firebasestorage.googleapis.com/v0/b/lehman-realty.appspot.com/o/users%2F${locals.userID}%2Fprofile%2F${fileName}?alt=media`
			});
	}
};
