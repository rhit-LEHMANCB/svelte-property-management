import { adminDB, adminStorage } from '$lib/server/admin';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { deleteDocs } from '$lib/server/firestoreDelete';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const userId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(userId);

	const propertyRef = adminDB.collection('properties').doc(params.propertyId);

	try {
		const [junctions, maintenance, paymentHistory] = await Promise.all([
			adminDB
				.collection('junction_user_property')
				.where('propertyId', '==', params.propertyId)
				.get(),
			adminDB.collection('maintenance').where('propertyId', '==', params.propertyId).get(),
			propertyRef.collection('payment_history').get()
		]);

		// The property document goes last so a failed delete can be repeated to finish the cleanup.
		await Promise.all([
			deleteDocs(
				[...junctions.docs, ...maintenance.docs, ...paymentHistory.docs].map((d) => d.ref)
			),
			adminStorage.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`).deleteFiles({
				prefix: `properties/${params.propertyId}/`
			})
		]);
		await propertyRef.delete();

		return json({ status: 'Property Deleted' });
	} catch (err) {
		console.log(err instanceof Error ? err.message : err);
		throw error(500, err instanceof Error ? err.message : 'Failed to delete the property');
	}
};
