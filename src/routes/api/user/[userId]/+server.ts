import { adminDB, adminAuth, adminStorage } from '#lib/server/admin';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_FB_STORAGE_BUCKET } from '$app/env/public';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}

	const userData = (await adminDB.collection('users').doc(locals.userID).get()).data();

	if (!userData || !userData.permissions || userData.permissions !== 'admin') {
		throw error(401, 'You must be an admin to do this.');
	}

	return Promise.all([
		adminAuth.deleteUser(params.userId),
		adminDB.collection('users').doc(params.userId).delete(),
		adminStorage.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`).deleteFiles({
			prefix: `users/${params.userId}/`
		})
	])
		.then(() => {
			return json({ status: 'User successfully deleted.' });
		})
		.catch((err) => {
			console.log(err.message);
			throw error(500, err);
		});
};
