import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { setSessionCookie } from '$lib/server/session';
import { verifyPassword } from '$lib/server/verifyPassword';

// Signs in without client-side scripts: the page posts here before it has hydrated, or when scripts
// are unavailable. After hydration the page signs in through the Firebase client SDK instead.
export const actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim();
		const password = String(data.get('password') ?? '');

		let idToken: string | null;
		try {
			idToken = email && password ? await verifyPassword(email, password) : null;
		} catch (err) {
			console.log(err instanceof Error ? err.message : err);
			return fail(500, { email, error: 'Sign-in is unavailable right now. Please try again.' });
		}

		if (!idToken) {
			return fail(400, { email, error: 'Your email or password is incorrect.' });
		}

		await setSessionCookie(cookies, idToken);

		throw redirect(303, '/');
	}
} satisfies Actions;
