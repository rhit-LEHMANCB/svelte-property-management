import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { leaseBilling, loadTenantLeases } from '$lib/server/leases';
import { loadLeaseLedger } from '$lib/server/balance';

export const load = (async ({ locals }) => {
	const uid = getUserIdOrError(locals.userID);
	const userData = await getUserDataOrError(uid);

	if (userData.permissions === 'admin') {
		throw redirect(303, '/admin');
	}
	// The lease cards, with the other tenants' names, which the layout does not load, and what each
	// lease holds (deposit, credit). Ended leases are shown only for their deposit.
	const tenantLeases = await loadTenantLeases(uid, { withOtherTenants: true });
	const cards = await Promise.all(
		tenantLeases.map(async ({ lease }) => ({
			...lease,
			billing: leaseBilling(await loadLeaseLedger(lease.id, lease))
		}))
	);
	return {
		leaseCards: cards.filter(
			(card) =>
				card.status !== 'ended' ||
				card.billing.deposit.amountCents > 0 ||
				card.billing.deposit.paidCents > 0
		)
	};
}) satisfies PageServerLoad;
