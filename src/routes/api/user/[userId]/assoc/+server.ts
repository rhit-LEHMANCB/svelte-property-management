import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDB } from '#lib/server/admin';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}

	const userData = (await adminDB.collection('users').doc(locals.userID).get()).data();

	if (!userData || !userData.permissions || userData.permissions !== 'admin') {
		throw error(401, 'You must be an admin to do this.');
	}

	const userJunctionsQuery = await adminDB
		.collection('junction_user_property')
		.where('tenantId', '==', params.userId)
		.get();

	if (userJunctionsQuery.size == 0) {
		return json({ userProperty: undefined });
	}

	if (userJunctionsQuery.size !== 1) {
		throw error(
			500,
			`User is associated with wrong number of properties: ${userJunctionsQuery.size}`
		);
	}

	return adminDB
		.collection('properties')
		.doc(userJunctionsQuery.docs[0].data().propertyId)
		.get()
		.then((userProperty) => {
			if (!userProperty.data) {
				throw error(500, 'Failed to find property info.');
			}
			return json({ id: userProperty.id, data: userProperty.data() });
		})
		.catch((err) => {
			console.log(err.message);
			throw error(500, err);
		});
};
