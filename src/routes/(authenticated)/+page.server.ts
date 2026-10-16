import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { leaseBilling, loadTenantLeases } from '$lib/server/leases';
import { loadLeaseLedger } from '$lib/server/balance';

export const load = (async ({ locals, parent }) => {
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
	// A tenant without a current lease is told why: the lease that starts next, with what can be
	// paid now (its deposit, or rent payable early), or that no lease is on file.
	const { userProperty } = await parent();
	const next = cards
		.filter((card) => card.status === 'upcoming')
		.sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
	const notice = userProperty
		? null
		: next
			? {
					kind: 'upcoming' as const,
					address: next.address,
					startDate: next.startDate,
					owedCents: next.billing.totalCents
				}
			: { kind: 'none' as const };
	return {
		notice,
		leaseCards: cards.filter(
			(card) =>
				card.status !== 'ended' ||
				card.billing.deposit.amountCents > 0 ||
				card.billing.deposit.paidCents > 0
		)
	};
}) satisfies PageServerLoad;
