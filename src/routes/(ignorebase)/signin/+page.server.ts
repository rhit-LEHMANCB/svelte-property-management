import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { setSessionCookie } from '$lib/server/session';
import { verifyPassword } from '$lib/server/verifyPassword';
import { SIGN_IN_MESSAGES } from '$lib/authErrors';

// `/reset` sends the user here after a successful password change.
export const load = (({ url }) => ({
	passwordChanged: url.searchParams.get('reset') === 'success'
})) satisfies PageServerLoad;

// Signs in without client-side scripts: the page posts here before it has hydrated, or when scripts
// are unavailable. After hydration the page signs in through the Firebase client SDK instead.
export const actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim();
		const password = String(data.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { email, error: SIGN_IN_MESSAGES.credentials });
		}

		try {
			const check = await verifyPassword(email, password);
			if ('error' in check) {
				return fail(400, { email, error: SIGN_IN_MESSAGES[check.error] });
			}
			await setSessionCookie(cookies, check.idToken);
		} catch (err) {
			console.log(err instanceof Error ? err.message : err);
			return fail(500, { email, error: SIGN_IN_MESSAGES.unavailable });
		}

		throw redirect(303, '/');
	}
} satisfies Actions;
