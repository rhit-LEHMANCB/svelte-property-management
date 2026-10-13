import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminDB } from '$lib/server/admin';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import type { LeaseDoc } from '$lib/server/leaseDates';
import { emptyLeaseForm, leaseFormAction } from '$lib/server/leaseForm';
import { propertyAddress, summarizeLease } from '$lib/server/leases';

export const load = (async ({ locals, params }) => {
	const userId = getUserIdOrError(locals.userID);
	await getAdminUserDataOrError(userId);

	const [propertySnap, leaseSnap] = await Promise.all([
		adminDB.collection('properties').doc(params.propertyId).get(),
		adminDB.collection('leases').doc(params.leaseId).get()
	]);
	const property = propertySnap.data();
	const lease = leaseSnap.data() as LeaseDoc | undefined;
	if (!property) throw error(404, 'Property not found');
	if (!lease || lease.propertyId !== params.propertyId) throw error(404, 'Lease not found');

	const summary = await summarizeLease(leaseSnap.id, lease);
	return {
		form: await emptyLeaseForm({
			rent: lease.rent,
			startDate: lease.startDate,
			endDate: lease.endDate ?? '',
			emails: summary.tenants.length > 0 ? summary.tenants.map((t) => t.email) : ['']
		}),
		property: { id: params.propertyId, title: property.title, address: propertyAddress(property) },
		lease: {
			...summary,
			documentName: lease.document?.fileName ?? null,
			// Ids with no user document cannot be shown as emails, so saving drops them.
			missingTenants: lease.tenantIds.length - summary.tenants.length
		}
	};
}) satisfies PageServerLoad;

export const actions = {
	default: leaseFormAction
} satisfies Actions;
