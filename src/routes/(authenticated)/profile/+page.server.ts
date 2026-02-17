import type { PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms/server';
import { adminAuth, adminDB, adminStorage } from '$lib/server/admin';
import { error, fail } from '@sveltejs/kit';
import { profileSchema } from '$lib/schemas';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { stripe } from '$lib/server/stripe';
import { getUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';

export const load = (async (event) => {
	const userId = getUserIdOrError(event.locals.userID);
	const userData = await getUserDataOrError(userId);

	const form = await superValidate(userData, profileSchema);
	return {
		form
	};
}) satisfies PageServerLoad;

export const actions = {
	contact: async (event) => {
		const form = await superValidate(event, profileSchema);

		const userId = getUserIdOrError(event.locals.userID);

		if (!form.valid) {
			return message(form, 'Invalid form');
		}

		const userDoc = adminDB.collection('users').doc(userId);

		await userDoc.update(form.data);

		const userData = (await userDoc.get()).data();

		if (!userData) {
			throw error(500, 'Error retrieving user details to update');
		}

		if (userData.stripeID) {
			await stripe.customers.update(userData.stripeID, {
				name: `${form.data.firstName} ${form.data.lastName}`,
				email: form.data.email,
				phone: form.data.phoneNumber
			});
		}

		await adminAuth.updateUser(userId, {
			email: form.data.email
		});
		return message(form, 'Form submitted');
	},
	photo: async ({ request, locals }) => {
		const userId = getUserIdOrError(locals.userID);

		const data = await request.formData();
		const file = data.get('photo') as File;
		if (file.size == 0) {
			return fail(400);
		}
		const storageRef = adminStorage.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`);
		await storageRef.deleteFiles({
			prefix: `users/${userId}/profile`
		});
		const ext = file.name.split('.').pop();
		const fileName = `${Date.now().toString()}.${ext}`;
		const blob = storageRef.file(`users/${userId}/profile/${fileName}`);
		const blobStream = blob.createWriteStream({ resumable: false });
		blobStream.end(new Uint8Array(await file.arrayBuffer()));

		await adminDB
			.collection('users')
			.doc(userId)
			.update({
				photoUrl: `https://firebasestorage.googleapis.com/v0/b/${PUBLIC_FB_STORAGE_BUCKET}/o/users%2F${userId}%2Fprofile%2F${fileName}?alt=media`
			});
	}
};
