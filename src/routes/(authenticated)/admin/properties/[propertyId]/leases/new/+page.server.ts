import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminDB } from '$lib/server/admin';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { emptyLeaseForm, leaseFormAction } from '$lib/server/leaseForm';
import { propertyAddress } from '$lib/server/leases';

export const load = (async ({ locals, params }) => {
	const userId = getUserIdOrError(locals.userID);
	await getAdminUserDataOrError(userId);

	const property = (await adminDB.collection('properties').doc(params.propertyId).get()).data();
	if (!property) throw error(404, 'Property not found');

	return {
		form: await emptyLeaseForm({ rent: property.rent }),
		property: { id: params.propertyId, title: property.title, address: propertyAddress(property) },
		lease: null
	};
}) satisfies PageServerLoad;

export const actions = {
	default: leaseFormAction
} satisfies Actions;
