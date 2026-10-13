import { requestPasswordReset } from '$lib/server/passwordReset';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Answers the same whether or not the address has an account or was rate limited.
export const PUT: RequestHandler = async ({ request }) => {
	const { email } = await request.json().catch(() => ({}));

	if (typeof email !== 'string' || !email.trim()) {
		throw error(400, 'Email is required');
	}

	try {
		await requestPasswordReset(email.trim());
	} catch (e) {
		console.error('Problem sending password reset email', e);
		throw error(500, 'Error sending reset email');
	}
	return json({ status: 'email_sent' });
};
