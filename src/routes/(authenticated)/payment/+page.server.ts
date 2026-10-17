import type { PageServerLoad } from './$types';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { loadLeaseLedger } from '$lib/server/balance';
import { latestOpenCharge, leaseRefOf, loadCharges, ownEnrollment } from '$lib/server/autopayStore';
import { inFlightCents } from '$lib/server/autopay';
import {
	bankInFlightCents,
	FAILURE_NOTICE_DAYS,
	loadBankPayments,
	startDayOf
} from '$lib/server/bankPayments';
import { addDays } from '$lib/server/billing';
import { businessToday } from '$lib/server/leaseDates';

export const load = (async (event) => {
	const uid = getUserIdOrError(event.locals.userID);

	const { userLeases = [] } = await event.parent();
	const today = businessToday();

	// Each lease has its own balance. An ended lease keeps its unpaid rent payable; an upcoming one
	// can owe its deposit, or rent payable 7 days early.
	const leases = (
		await Promise.all(
			userLeases.map(async (lease) => {
				const leaseRef = leaseRefOf(lease.id);
				const [ledger, enrollment, charges, bankPayments] = await Promise.all([
					loadLeaseLedger(lease.id, lease),
					ownEnrollment(leaseRef, uid),
					loadCharges(leaseRef),
					loadBankPayments(leaseRef)
				]);
				// The caller's own failed bank payment from the last few days, newest first.
				const failed = bankPayments
					.filter(
						(p) =>
							p.uid === uid &&
							p.state === 'failed' &&
							p.failedDay &&
							addDays(p.failedDay, FAILURE_NOTICE_DAYS) >= today
					)
					.sort((a, b) => (b.failedDay ?? '').localeCompare(a.failedDay ?? ''))[0];
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
					// What can be paid now: money already on its way is not paid twice.
					payableCents: Math.max(
						0,
						ledger.totalCents - inFlightCents(charges) - bankInFlightCents(bankPayments)
					),
					// Every tenant on the lease sees bank payments that are processing, but only amounts and
					// days: never who made them or why one failed.
					bankPayments: {
						pending: bankPayments
							.filter((p) => p.state === 'pending')
							.map((p) => ({
								amountCents: p.amountCents,
								day: startDayOf(p)
							}))
							.sort((a, b) => a.day.localeCompare(b.day)),
						failed: failed
							? {
									amountCents: failed.amountCents,
									day: startDayOf(failed)
								}
							: null
					},
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
