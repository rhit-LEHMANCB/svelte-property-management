import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setSessionCookie } from '$lib/server/session';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { idToken } = await request.json();

	await setSessionCookie(cookies, idToken);

	return json({ status: 'signedIn' });
};

export const DELETE: RequestHandler = async ({ cookies }) => {
	cookies.delete('__session', { path: '/' });
	return json({ status: 'signedOut' });
};
