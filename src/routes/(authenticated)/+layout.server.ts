import { adminDB } from '$lib/server/admin';
import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load = (async ({ locals }) => {
	const uid = locals.userID;

	if (!uid) {
		throw error(500, 'Failed to find user info.');
	}

	const userData = (await adminDB.collection('users').doc(uid).get()).data();

	if (!userData) {
		throw error(500, 'Failed to find user info.');
	}

	if (userData.isFirstLogin) {
		throw redirect(303, '/profile');
	}

	if (userData.permissions === 'admin') {
		return {
			user: userData
		};
	}

	const userJunctionsQuery = await adminDB
		.collection('junction_user_property')
		.where('tenantId', '==', uid)
		.get();

	if (userJunctionsQuery.size !== 1) {
		throw error(
			500,
			`User is associated with wrong number of properties: ${userJunctionsQuery.size}`
		);
	}

	const userProperty = await adminDB
		.collection('properties')
		.doc(userJunctionsQuery.docs[0].data().propertyId)
		.get();

	const userPropertyData = userProperty.data();
	if (!userPropertyData) {
		throw error(500, 'Failed to find property info.');
	}

	return {
		user: userData,
		userProperty: { id: userProperty.id, data: userPropertyData }
	};
}) satisfies LayoutServerLoad;
