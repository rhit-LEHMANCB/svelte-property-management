import { adminDB, adminStorage } from '$lib/server/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { error, isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { deleteDocs } from '$lib/server/firestoreDelete';
import { deleteLease, readLeasePayments } from '$lib/server/leases';

const PAID_LEASES_MESSAGE =
	'This property has leases with recorded payments, so it cannot be deleted. Set an end date on those leases instead.';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const userId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(userId);

	const propertyRef = adminDB.collection('properties').doc(params.propertyId);

	try {
		const leases = await adminDB
			.collection('leases')
			.where('propertyId', '==', params.propertyId)
			.get();
		// Payment history is never deleted: the property is refused before anything is removed...
		const checks = await Promise.all(leases.docs.map((lease) => readLeasePayments(lease.ref)));
		if (checks.some((check) => check.hasPayments)) throw error(409, PAID_LEASES_MESSAGE);
		// ...and each lease is removed by the same transaction that deletes a single lease, which checks
		// again, so a payment recorded since is kept with its lease. The leases that were already
		// removed had no payments. Their ids are kept on the property until their files are gone, so
		// repeating a delete whose Storage cleanup failed still finds them.
		const property = await propertyRef.get();
		if (property.exists && leases.size > 0) {
			await propertyRef.update({
				leaseFilesToDelete: FieldValue.arrayUnion(...leases.docs.map((l) => l.id))
			});
		}
		for (const lease of leases.docs) {
			if ((await deleteLease(lease.id)) === 'has-payments') throw error(409, PAID_LEASES_MESSAGE);
		}
		const leaseIds = new Set<string>([
			...((property.data()?.leaseFilesToDelete as string[] | undefined) ?? []),
			...leases.docs.map((lease) => lease.id)
		]);

		const [junctions, maintenance, paymentHistory, recordedInvoices] = await Promise.all([
			// Tenant links from before leases; kept by the lease migration until a later cleanup.
			adminDB
				.collection('junction_user_property')
				.where('propertyId', '==', params.propertyId)
				.get(),
			adminDB.collection('maintenance').where('propertyId', '==', params.propertyId).get(),
			propertyRef.collection('payment_history').get(),
			propertyRef.collection('recorded_invoices').get()
		]);

		const bucket = adminStorage.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`);
		// The property document goes last, so a failed delete can be repeated to find and finish the
		// rest of the cleanup.
		await Promise.all([
			deleteDocs(
				[
					...junctions.docs,
					...maintenance.docs,
					...paymentHistory.docs,
					...recordedInvoices.docs
				].map((d) => d.ref)
			),
			bucket.deleteFiles({ prefix: `properties/${params.propertyId}/` }),
			// Also done by deleteLease, which only logs a failure; here it fails the request.
			...[...leaseIds].map((id) => bucket.deleteFiles({ prefix: `leases/${id}/` }))
		]);
		await propertyRef.delete();

		return json({ status: 'Property Deleted' });
	} catch (err) {
		if (isHttpError(err)) throw err;
		console.log(err instanceof Error ? err.message : err);
		throw error(500, err instanceof Error ? err.message : 'Failed to delete the property');
	}
};
