import type { PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { adminAuth, adminDB, adminStorage } from '$lib/server/admin';
import { error, fail } from '@sveltejs/kit';
import { profileSchema } from '$lib/schemas';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { stripe } from '$lib/server/stripe';
import { verifyPassword } from '$lib/server/verifyPassword';
import { getUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';

export const load = (async (event) => {
	const userId = getUserIdOrError(event.locals.userID);
	const userData = await getUserDataOrError(userId);

	const form = await superValidate(userData, zod(profileSchema));
	return {
		form
	};
}) satisfies PageServerLoad;

export const actions = {
	contact: async (event) => {
		const form = await superValidate(event, zod(profileSchema));

		const userId = getUserIdOrError(event.locals.userID);

		if (!form.valid) {
			return message(form, 'Invalid form');
		}

		const { currentPassword, ...contact } = form.data;
		const userDoc = adminDB.collection('users').doc(userId);
		const previous = (await userDoc.get()).data();

		if (!previous) {
			throw error(500, 'Error retrieving user details to update');
		}

		const emailChanged = contact.email !== previous.email;

		if (emailChanged) {
			let verified: string | null = null;
			try {
				verified = currentPassword ? await verifyPassword(previous.email, currentPassword) : null;
			} catch (err) {
				console.log(err instanceof Error ? err.message : err);
				return message(form, 'Could not verify your password. Please try again.', { status: 500 });
			}
			if (!verified) {
				return message(form, 'Enter your current password to change your email.', { status: 400 });
			}
		}

		// Auth, then Stripe, then Firestore. Each finished step registers how to restore it, so a later
		// failure leaves all three systems with the previous values.
		const undo: (() => Promise<unknown>)[] = [];

		try {
			if (emailChanged) {
				await adminAuth.updateUser(userId, { email: contact.email });
				undo.push(() => adminAuth.updateUser(userId, { email: previous.email }));
			}

			if (previous.stripeID) {
				await stripe.customers.update(previous.stripeID, {
					name: `${contact.firstName} ${contact.lastName}`,
					email: contact.email,
					phone: contact.phoneNumber
				});
				undo.push(() =>
					stripe.customers.update(previous.stripeID, {
						name: `${previous.firstName} ${previous.lastName}`,
						email: previous.email,
						phone: previous.phoneNumber
					})
				);
			}

			await userDoc.update(contact);
		} catch (err) {
			console.log(err instanceof Error ? err.message : err);

			for (const step of undo.reverse()) {
				await step().catch((undoError) =>
					console.log(
						`Profile rollback failed for ${userId}:`,
						undoError instanceof Error ? undoError.message : undoError
					)
				);
			}

			return message(form, 'Your changes could not be saved. Please try again.', { status: 500 });
		}

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
