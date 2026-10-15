import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import type { PageServerLoad } from './$types';
import { passwordChangeSchema } from '$lib/schemas';

export const load = (async ({ url }) => {
	const oobCode = url.searchParams.get('oobCode');

	// Checked here, not while the page renders, so a bad link answers 400 rather than 500.
	if (url.searchParams.get('mode') !== 'resetPassword' || !oobCode) {
		throw error(400, 'Invalid action');
	}

	const form = await superValidate(zod(passwordChangeSchema));
	return {
		form,
		oobCode
	};
}) satisfies PageServerLoad;
