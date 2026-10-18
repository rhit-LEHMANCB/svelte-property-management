import { adminDB } from './admin';
import { loadLeaseLedger } from './balance';
import { latestOpenCharge, leaseRefOf, loadCharges, ownEnrollment } from './autopayStore';
import { inFlightCents } from './autopay';
import {
	bankInFlightCents,
	FAILURE_NOTICE_DAYS,
	loadBankPayments,
	startDayOf
} from './bankPayments';
import { addDays } from './billing';
import { businessToday } from './leaseDates';
import type { loadTenantLeases } from './leases';

type TenantLease = Awaited<ReturnType<typeof loadTenantLeases>>[number]['lease'];

/**
 * What a tenant owes and has in flight on each of their leases, as Payment and the dashboard show
 * it. Only the caller's own enrollment, charges and failed bank payments are included.
 */
export async function tenantLeaseSummaries(
	uid: string,
	userLeases: TenantLease[],
	today = businessToday()
) {
	// Each lease has its own balance. An ended lease keeps its unpaid rent payable; an upcoming one
	// can owe its deposit, or rent payable 7 days early.
	return Promise.all(
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
	);
}

export type TenantLeaseSummary = Awaited<ReturnType<typeof tenantLeaseSummaries>>[number];

/** The number of open maintenance requests for a property. */
export async function openRequestCount(propertyId: string) {
	const snapshot = await adminDB
		.collection('maintenance')
		.where('propertyId', '==', propertyId)
		.where('status', '==', 'Open')
		.get();
	return snapshot.docs.length;
}

export const INSURANCE_ENDING_SOON_DAYS = 30;

export type InsuranceStatus =
	| { state: 'missing' }
	| { state: 'on-file' | 'ending-soon' | 'expired'; endDate: string; companyName: string };

/**
 * A saved renters insurance policy against today (both calendar days, YYYY-MM-DD): on file, ending
 * within {INSURANCE_ENDING_SOON_DAYS} days, expired, or missing.
 */
export function insuranceStatus(
	insurance: { endDate?: unknown; companyName?: unknown } | undefined,
	today: string
): InsuranceStatus {
	const end = insurance?.endDate ? new Date(String(insurance.endDate)) : null;
	if (!end || Number.isNaN(end.getTime())) return { state: 'missing' };
	const endDate = end.toISOString().slice(0, 10);
	const companyName = String(insurance?.companyName ?? '');
	if (endDate < today) return { state: 'expired', endDate, companyName };
	if (endDate <= addDays(today, INSURANCE_ENDING_SOON_DAYS))
		return { state: 'ending-soon', endDate, companyName };
	return { state: 'on-file', endDate, companyName };
}
