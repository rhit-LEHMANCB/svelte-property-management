import { sendPasswordResetEmail } from '#lib/server/email';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request }) => {
	const { email } = await request.json();

	return sendPasswordResetEmail(email, false)
		.then(() => {
			return json({ status: 'email_sent' });
		})
		.catch((e: Error) => {
			throw error(500, e);
		});
};
