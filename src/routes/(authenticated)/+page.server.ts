import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { adminDB } from '$lib/server/admin';

export const load = (async ({ locals }) => {
	const uid = locals.userID;

	if (!uid) {
		throw error(500, 'Failed to find user info.');
	}

	const userData = (await adminDB.collection('users').doc(uid).get()).data();

	if (!userData) {
		throw error(500, 'Failed to find user info.');
	}

	if (userData.permissions === 'admin') {
		throw redirect(303, '/admin');
	}
	return {};
}) satisfies PageServerLoad;
