import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDB } from './admin';
import { monthOf, type LeaseDoc } from './leaseDates';
import { computeBalance, monthsOwed, type Balance, type YearHistory } from './payments';

/** The months a lease is billed for: from its start month through its end month (if any). */
export const leaseMonths = (lease: Pick<LeaseDoc, 'startDate' | 'endDate'>) => ({
	startMonth: monthOf(lease.startDate),
	endMonth: lease.endDate ? monthOf(lease.endDate) : null
});

/** Reads the `payment_history` year documents under `parent` that cover every month owed. */
export async function loadHistories(
	parent: DocumentReference,
	months: { startMonth?: string; endMonth?: string | null },
	now: Date,
	// A transaction passes its own `get` so that the reads are part of it.
	read: (ref: DocumentReference) => Promise<DocumentSnapshot> = (ref) => ref.get()
): Promise<Record<string, YearHistory>> {
	const owed = monthsOwed(months.startMonth, now, months.endMonth);
	const years = [...new Set(owed.map((m) => String(m.year)))];
	const histories: Record<string, YearHistory> = {};
	await Promise.all(
		years.map(async (year) => {
			const doc = await read(parent.collection('payment_history').doc(year));
			histories[year] = doc.data() as YearHistory;
		})
	);
	return histories;
}

/** Reads the payment history a lease's balance depends on and computes it. */
export async function loadLeaseBalance(
	leaseId: string,
	lease: Pick<LeaseDoc, 'rent' | 'startDate' | 'endDate'>,
	now = new Date()
): Promise<Balance> {
	const months = leaseMonths(lease);
	const histories = await loadHistories(adminDB.collection('leases').doc(leaseId), months, now);
	return computeBalance({ rent: lease.rent, ...months, histories, now });
}
