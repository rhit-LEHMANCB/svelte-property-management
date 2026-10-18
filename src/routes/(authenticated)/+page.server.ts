import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { leaseBilling, loadTenantLeases } from '$lib/server/leases';
import { loadLeaseLedger } from '$lib/server/balance';
import { businessToday } from '$lib/server/leaseDates';
import { insuranceStatus, openRequestCount, tenantLeaseSummaries } from '$lib/server/tenantSummary';

export const load = (async ({ locals, parent }) => {
	const uid = getUserIdOrError(locals.userID);
	const userData = await getUserDataOrError(uid);

	if (userData.permissions === 'admin') {
		throw redirect(303, '/admin');
	}
	// The lease cards, with the other tenants' names, which the layout does not load, and what each
	// lease holds (deposit, credit). Ended leases are shown only for their deposit.
	const tenantLeases = await loadTenantLeases(uid, { withOtherTenants: true });
	// Each ledger is loaded once, for the cards and for the summary tiles below.
	const ledgers = new Map(
		await Promise.all(
			tenantLeases.map(
				async ({ lease }) => [lease.id, await loadLeaseLedger(lease.id, lease)] as const
			)
		)
	);
	const cards = tenantLeases.map(({ lease }) => ({
		...lease,
		billing: leaseBilling(ledgers.get(lease.id)!)
	}));
	// A tenant without a current lease is told why: the lease that starts next, with what can be
	// paid now on all their leases (a deposit, rent payable early, or an ended lease's balance), or
	// that no lease is on file.
	const { userProperty, userLeases = [] } = await parent();
	const today = businessToday();
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
					owedCents: cards.reduce((sum, card) => sum + card.billing.totalCents, 0)
				}
			: { kind: 'none' as const };
	// The summary tiles: what is owed across the tenant's leases, whether their own autopay is on, and
	// the open requests for the property they live in. Only the caller's own data is read.
	const [summaries, openRequests] = await Promise.all([
		tenantLeaseSummaries(uid, userLeases, today, ledgers),
		userProperty ? openRequestCount(userProperty.id) : Promise.resolve(0)
	]);
	const owing = summaries.filter((lease) => lease.balanceCents > 0);
	const summary = {
		balanceCents: owing.reduce((sum, lease) => sum + lease.balanceCents, 0),
		dueDate:
			owing
				.map((lease) => lease.dueDate)
				.filter((day): day is string => !!day)
				.sort()[0] ?? null,
		autopayOn: summaries.some(
			(lease) => lease.status !== 'ended' && lease.autopay.enrollment !== null
		),
		openRequests,
		hasProperty: !!userProperty,
		insurance: insuranceStatus(userData.insurance, today)
	};
	return {
		summary,
		notice,
		leaseCards: cards.filter(
			(card) =>
				card.status !== 'ended' ||
				card.billing.deposit.amountCents > 0 ||
				card.billing.deposit.paidCents > 0
		)
	};
}) satisfies PageServerLoad;
