import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { currentTenancy, loadTenantLeases } from '$lib/server/leases';

// Pages only tenants use. Admins who open them (typed URL, old bookmark) go to the admin home.
const tenantOnlyRoutes = [
	'/(authenticated)/maintenance',
	'/(authenticated)/insurance',
	'/(authenticated)/payment'
];

const isTenantOnlyRoute = (routeId: string | null) =>
	routeId !== null && tenantOnlyRoutes.some((r) => routeId === r || routeId.startsWith(`${r}/`));

export const load = (async ({ locals, route }) => {
	const uid = getUserIdOrError(locals.userID);
	const userData = await getUserDataOrError(uid);

	if (userData.isFirstLogin) {
		throw redirect(303, '/profile');
	}

	if (userData.permissions === 'admin') {
		if (isTenantOnlyRoute(route.id)) {
			throw redirect(303, '/admin');
		}
		return {
			user: userData
		};
	}

	// A tenant's property is the one of their current lease. A tenant without one (new, not started,
	// ended, or their property was deleted) still gets the app, so they can reach their profile;
	// pages that need a property send them to the dashboard.
	const tenantLeases = await loadTenantLeases(uid);
	const userLeases = tenantLeases.map((l) => l.lease);
	const chosen = currentTenancy(tenantLeases);
	if (!chosen) {
		return { user: userData, userLeases };
	}

	return {
		user: userData,
		userLeases,
		userProperty: { id: chosen.lease.propertyId, data: chosen.property }
	};
}) satisfies LayoutServerLoad;
