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
		const [junctions, maintenance, paymentHistory, recordedInvoices, leases] = await Promise.all([
			// Tenant links from before leases; kept by the lease migration until a later cleanup.
			adminDB
				.collection('junction_user_property')
				.where('propertyId', '==', params.propertyId)
				.get(),
			adminDB.collection('maintenance').where('propertyId', '==', params.propertyId).get(),
			propertyRef.collection('payment_history').get(),
			propertyRef.collection('recorded_invoices').get(),
			adminDB.collection('leases').where('propertyId', '==', params.propertyId).get()
		]);
		const leaseChildren = await Promise.all(
			leases.docs.flatMap((lease) => [
				lease.ref.collection('payment_history').get(),
				lease.ref.collection('recorded_invoices').get()
			])
		);

		const bucket = adminStorage.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`);
		// The leases and the property document go last, so a failed delete can be repeated to find
		// and finish the rest of the cleanup.
		await Promise.all([
			deleteDocs(
				[
					...junctions.docs,
					...maintenance.docs,
					...paymentHistory.docs,
					...recordedInvoices.docs,
					...leaseChildren.flatMap((snapshot) => snapshot.docs)
				].map((d) => d.ref)
			),
			bucket.deleteFiles({ prefix: `properties/${params.propertyId}/` }),
			...leases.docs.map((lease) => bucket.deleteFiles({ prefix: `leases/${lease.id}/` }))
		]);
		await deleteDocs(leases.docs.map((d) => d.ref));
		await propertyRef.delete();

		return json({ status: 'Property Deleted' });
	} catch (err) {
		console.log(err instanceof Error ? err.message : err);
		throw error(500, err instanceof Error ? err.message : 'Failed to delete the property');
	}
};
