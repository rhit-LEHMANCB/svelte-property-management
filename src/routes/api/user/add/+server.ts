import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { createTenantAccount } from '$lib/server/users';

export const POST: RequestHandler = async ({ request, locals }) => {
	const adminId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(adminId);

	const { email } = await request.json();

	try {
		// Undoes its own completed steps on failure, so a failure leaves nothing behind.
		await createTenantAccount(email, { sendWelcome: true });
		return json({ status: 'New User Created' });
	} catch (err) {
		console.log(err instanceof Error ? err.message : err);
		throw error(500, err instanceof Error ? err.message : 'Failed to create the user');
	}
};
