import { adminDB } from './admin';
import { computeBalance, monthsOwed, type Balance, type YearHistory } from './payments';

/** Reads the payment history a tenant's balance depends on and computes it. */
export async function loadBalance(
	propertyId: string,
	rent: number,
	moveInMonth: string | undefined,
	now = new Date()
): Promise<Balance> {
	const years = [...new Set(monthsOwed(moveInMonth, now).map((m) => String(m.year)))];
	const histories: Record<string, YearHistory> = {};
	await Promise.all(
		years.map(async (year) => {
			const doc = await adminDB
				.collection('properties')
				.doc(propertyId)
				.collection('payment_history')
				.doc(year)
				.get();
			histories[year] = doc.data() as YearHistory;
		})
	);
	return computeBalance({ rent, moveInMonth, histories, now });
}
