import { superValidate } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import type { PageServerLoad } from './$types';
import { passwordChangeSchema } from '#lib/schemas';

export const load = (async () => {
	const form = await superValidate(zod(passwordChangeSchema));
	return {
		form
	};
}) satisfies PageServerLoad;
