import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { loadLeaseLedger } from '$lib/server/balance';

export const load = (async (event) => {
	getUserIdOrError(event.locals.userID);

	const { userLeases = [] } = await event.parent();

	// Each lease has its own balance. Show the current lease, and any other lease with money owed
	// (an ended lease keeps its unpaid rent payable; an upcoming one can owe its deposit).
	const leases = (
		await Promise.all(
			userLeases.map(async (lease) => {
				const ledger = await loadLeaseLedger(lease.id, lease);
				return {
					id: lease.id,
					address: lease.address,
					status: lease.status,
					startDate: lease.startDate,
					endDate: lease.endDate,
					balanceCents: ledger.totalCents,
					dueDate: ledger.dueDate,
					owed: ledger.owed,
					creditCents: ledger.creditCents
				};
			})
		)
	).filter((lease) => lease.status === 'current' || lease.balanceCents > 0);

	// A tenant with nothing to show here has nothing to pay; the dashboard explains why.
	if (leases.length === 0) {
		throw redirect(303, '/');
	}

	return { leases };
}) satisfies PageServerLoad;
