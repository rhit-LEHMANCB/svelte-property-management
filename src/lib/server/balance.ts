import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDB } from './admin';
import { computeBalance, monthsOwed, type Balance, type YearHistory } from './payments';

/** Reads the `payment_history` year documents that cover every month owed. */
export async function loadHistories(
	propertyId: string,
	moveInMonth: string | undefined,
	now: Date,
	// A transaction passes its own `get` so that the reads are part of it.
	read: (ref: DocumentReference) => Promise<DocumentSnapshot> = (ref) => ref.get()
): Promise<Record<string, YearHistory>> {
	const years = [...new Set(monthsOwed(moveInMonth, now).map((m) => String(m.year)))];
	const histories: Record<string, YearHistory> = {};
	await Promise.all(
		years.map(async (year) => {
			const doc = await read(
				adminDB.collection('properties').doc(propertyId).collection('payment_history').doc(year)
			);
			histories[year] = doc.data() as YearHistory;
		})
	);
	return histories;
}

/** Reads the payment history a tenant's balance depends on and computes it. */
export async function loadBalance(
	propertyId: string,
	rent: number,
	moveInMonth: string | undefined,
	now = new Date()
): Promise<Balance> {
	const histories = await loadHistories(propertyId, moveInMonth, now);
	return computeBalance({ rent, moveInMonth, histories, now });
}
