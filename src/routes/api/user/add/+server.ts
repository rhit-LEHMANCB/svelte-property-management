import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminAuth, adminDB } from '$lib/server/admin';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { sendPasswordResetEmail } from '$lib/server/email';
import { stripe } from '$lib/server/stripe';

export const POST: RequestHandler = async ({ request, locals }) => {
	const adminId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(adminId);

	const { email } = await request.json();

	// Each completed step registers how to undo it, so a later failure leaves nothing behind.
	const undo: (() => Promise<unknown>)[] = [];

	try {
		const userRecord = await adminAuth.createUser({ email: email });
		undo.push(() => adminAuth.deleteUser(userRecord.uid));

		const stripeCustomer = await stripe.customers.create({
			name: 'New User',
			email: email
		});
		undo.push(() => stripe.customers.del(stripeCustomer.id));

		const userDoc = adminDB.collection('users').doc(userRecord.uid);
		await userDoc.set({
			email: email,
			firstName: 'New',
			lastName: 'User',
			phoneNumber: '',
			permissions: 'user',
			stripeID: stripeCustomer.id
		});
		undo.push(() => userDoc.delete());

		await sendPasswordResetEmail(email, true);

		return json({ status: 'New User Created' });
	} catch (err) {
		console.log(err instanceof Error ? err.message : err);

		for (const step of undo.reverse()) {
			await step().catch((undoError) =>
				console.log(
					'Rollback step failed:',
					undoError instanceof Error ? undoError.message : undoError
				)
			);
		}

		throw error(500, err instanceof Error ? err.message : 'Failed to create the user');
	}
};
