import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { emailSchema } from '$lib/schemas';
import { requestPasswordReset } from '$lib/server/passwordReset';

// A plain form post, so it works before the page hydrates and without scripts.
export const actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim();

		if (!emailSchema.safeParse(email).success) {
			return fail(400, { email, field: 'email' as const, error: 'Please enter a valid email.' });
		}

		try {
			// `sent` and `suppressed` are answered alike so the page never reveals who has an account.
			await requestPasswordReset(email);
		} catch (err) {
			console.error('Problem sending password reset email', err);
			return fail(500, { email, error: "We couldn't send the email right now. Please try again." });
		}

		return { requested: true };
	}
} satisfies Actions;
