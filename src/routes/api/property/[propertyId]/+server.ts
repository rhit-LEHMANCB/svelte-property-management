import { adminDB, adminStorage } from '$lib/server/admin';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const userId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(userId);

	return Promise.all([
		adminDB.collection('properties').doc(params.propertyId).delete(),
		adminDB
			.collection('maintenance')
			.where('propertyId', '==', params.propertyId)
			.get()
			.then(function (querySnapshot) {
				querySnapshot.forEach(function (doc) {
					doc.ref.delete();
				});
			}),
		adminStorage.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`).deleteFiles({
			prefix: `properties/${params.propertyId}/`
		})
	])
		.then(() => {
			return json({ status: 'Property Deleted' });
		})
		.catch((err) => {
			console.log(err.message);
			throw error(500, err);
		});
};
