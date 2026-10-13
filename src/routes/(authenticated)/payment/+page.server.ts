import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { loadLeaseBalance } from '$lib/server/balance';

export const load = (async (event) => {
	getUserIdOrError(event.locals.userID);

	const { userLeases = [] } = await event.parent();

	// Each lease has its own balance. Show the current lease, and any other lease with money owed
	// (an ended lease keeps its unpaid rent payable).
	const leases = (
		await Promise.all(
			userLeases.map(async (lease) => ({
				id: lease.id,
				address: lease.address,
				status: lease.status,
				startDate: lease.startDate,
				endDate: lease.endDate,
				...(await loadLeaseBalance(lease.id, lease))
			}))
		)
	).filter((lease) => lease.status === 'current' || lease.balanceCents > 0);

	// A tenant with nothing to show here has nothing to pay; the dashboard explains why.
	if (leases.length === 0) {
		throw redirect(303, '/');
	}

	return { leases };
}) satisfies PageServerLoad;
