import { adminDB, adminAuth, adminStorage } from '$lib/server/admin';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { deleteDocs } from '$lib/server/firestoreDelete';
import { stripe } from '$lib/server/stripe';

const codeOf = (err: unknown) => (err as { code?: string } | undefined)?.code;

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const adminId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(adminId);

	if (params.userId === adminId) {
		throw error(400, 'You cannot delete your own account.');
	}

	try {
		const userRef = adminDB.collection('users').doc(params.userId);
		const stripeID = (await userRef.get()).data()?.stripeID;

		// A customer or account that is already gone counts as done, so a failed delete can be repeated.
		if (stripeID) {
			await stripe.customers.del(stripeID).catch((err) => {
				if (codeOf(err) !== 'resource_missing') throw err;
			});
		}

		const junctions = await adminDB
			.collection('junction_user_property')
			.where('tenantId', '==', params.userId)
			.get();

		await Promise.all([
			deleteDocs(junctions.docs.map((doc) => doc.ref)),
			adminStorage.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`).deleteFiles({
				prefix: `users/${params.userId}/`
			})
		]);
		await userRef.delete();
		await adminAuth.deleteUser(params.userId).catch((err) => {
			if (codeOf(err) !== 'auth/user-not-found') throw err;
		});

		return json({ status: 'User successfully deleted.' });
	} catch (err) {
		console.log(err instanceof Error ? err.message : err);
		throw error(500, err instanceof Error ? err.message : 'Failed to delete the user');
	}
};
