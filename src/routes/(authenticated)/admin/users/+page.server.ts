import { adminDB } from '$lib/server/admin';
import type { PageServerLoad } from './$types';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { businessToday, leaseStatus, type LeaseDoc } from '$lib/server/leaseDates';
import { propertyAddress } from '$lib/server/leases';

export const load = (async (event) => {
	const userId = getUserIdOrError(event.locals.userID);
	await getAdminUserDataOrError(userId);

	const usersRef = adminDB.collection('users');
	const [users, leases] = await Promise.all([
		usersRef.orderBy('lastName').get(),
		adminDB.collection('leases').get()
	]);

	// Each tenant's property is the one of their current lease (the latest start, if data ever
	// holds two).
	const today = businessToday();
	const currentLease = new Map<string, LeaseDoc>();
	for (const doc of leases.docs) {
		const lease = doc.data() as LeaseDoc;
		if (leaseStatus(lease, today) !== 'current') continue;
		for (const tenantId of lease.tenantIds) {
			const seen = currentLease.get(tenantId);
			if (!seen || lease.startDate > seen.startDate) currentLease.set(tenantId, lease);
		}
	}
	const propertyIds = [...new Set([...currentLease.values()].map((l) => l.propertyId))];
	const properties = await Promise.all(
		propertyIds.map((id) => adminDB.collection('properties').doc(id).get())
	);
	const addressOf = new Map(
		properties.filter((p) => p.exists).map((p) => [p.id, propertyAddress(p.data())])
	);

	return {
		users: users.docs.map((user) => {
			const propertyId = currentLease.get(user.id)?.propertyId;
			const address = propertyId ? addressOf.get(propertyId) : undefined;
			return {
				id: user.id,
				data: user.data(),
				property: propertyId && address ? { id: propertyId, address } : null
			};
		})
	};
}) satisfies PageServerLoad;
