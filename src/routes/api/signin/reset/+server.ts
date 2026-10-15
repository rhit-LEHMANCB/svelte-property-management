import { emailSchema } from '$lib/schemas';
import { requestPasswordReset } from '$lib/server/passwordReset';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Answers the same whether or not the address has an account or was rate limited.
export const PUT: RequestHandler = async ({ request }) => {
	const { email } = await request.json().catch(() => ({}));

	const parsed = emailSchema.safeParse(typeof email === 'string' ? email.trim() : email);
	if (!parsed.success) {
		throw error(400, 'A valid email is required');
	}

	try {
		await requestPasswordReset(parsed.data);
	} catch (e) {
		console.error('Problem sending password reset email', e);
		throw error(500, 'Error sending reset email');
	}
	return json({ status: 'email_sent' });
};
