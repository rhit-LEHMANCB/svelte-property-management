import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { loadTenantLeases } from '$lib/server/leases';

export const load = (async ({ locals }) => {
	const uid = getUserIdOrError(locals.userID);
	const userData = await getUserDataOrError(uid);

	if (userData.permissions === 'admin') {
		throw redirect(303, '/admin');
	}
	// The lease cards, with the other tenants' names, which the layout does not load.
	const tenantLeases = await loadTenantLeases(uid, { withOtherTenants: true });
	return { leaseCards: tenantLeases.map((l) => l.lease) };
}) satisfies PageServerLoad;
