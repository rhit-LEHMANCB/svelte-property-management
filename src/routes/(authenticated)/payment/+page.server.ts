import type { PageServerLoad } from './$types';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { loadLeaseLedger } from '$lib/server/balance';
import { latestOpenCharge, leaseRefOf, loadCharges, ownEnrollment } from '$lib/server/autopayStore';

export const load = (async (event) => {
	const uid = getUserIdOrError(event.locals.userID);

	const { userLeases = [] } = await event.parent();

	// Each lease has its own balance. An ended lease keeps its unpaid rent payable; an upcoming one
	// can owe its deposit, or rent payable 7 days early.
	const leases = (
		await Promise.all(
			userLeases.map(async (lease) => {
				const leaseRef = leaseRefOf(lease.id);
				const [ledger, enrollment, charges] = await Promise.all([
					loadLeaseLedger(lease.id, lease),
					ownEnrollment(leaseRef, uid),
					loadCharges(leaseRef)
				]);
				return {
					id: lease.id,
					address: lease.address,
					status: lease.status,
					startDate: lease.startDate,
					endDate: lease.endDate,
					balanceCents: ledger.totalCents,
					dueDate: ledger.dueDate,
					owed: ledger.owed,
					creditCents: ledger.creditCents,
					// Only the caller's own enrollment and charges, never another tenant's.
					autopay: {
						enrollment,
						charge: latestOpenCharge(charges, { uid, owedCents: ledger.totalCents })
					}
				};
			})
		)
	).filter((lease) => lease.status !== 'ended' || lease.balanceCents > 0);

	// Current and upcoming leases are listed even with nothing owed, so autopay can be set up before
	// move-in; an ended lease only while it owes money. With nothing to list, the page says so.
	return { leases };
}) satisfies PageServerLoad;
