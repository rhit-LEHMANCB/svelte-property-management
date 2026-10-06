/** The business operates on Eastern time; rent months are decided here, not in server locale. */
export const BUSINESS_TIME_ZONE = 'America/Indiana/Indianapolis';

export const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

export const MOVE_IN_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type MonthKey = { year: number; month: number; monthName: string; key: string };

const monthFormat = new Intl.DateTimeFormat('en-US', {
	timeZone: BUSINESS_TIME_ZONE,
	year: 'numeric',
	month: '2-digit'
});

/** The calendar month a moment falls in, in the business time zone (`month` is 1 to 12). */
export function getMonthKey(date: Date): MonthKey {
	const parts = monthFormat.formatToParts(date);
	const year = Number(parts.find((p) => p.type === 'year')?.value);
	const month = Number(parts.find((p) => p.type === 'month')?.value);
	return {
		year,
		month,
		monthName: MONTH_NAMES[month - 1],
		key: `${year}-${String(month).padStart(2, '0')}`
	};
}

type MonthEntry = { remainingBalance?: number } | undefined;
/** A `payment_history/{year}` document: month name -> entry. */
export type YearHistory = Record<string, MonthEntry> | undefined;

/** Every month from the move-in month (or only the current one) through the current month. */
export function monthsOwed(moveInMonth: string | undefined, now: Date): MonthKey[] {
	const current = getMonthKey(now);
	let year = current.year;
	let month = current.month;
	if (moveInMonth && MOVE_IN_MONTH_PATTERN.test(moveInMonth)) {
		const [y, m] = moveInMonth.split('-').map(Number);
		if (y < year || (y === year && m <= month)) {
			year = y;
			month = m;
		}
	}
	const months: MonthKey[] = [];
	while (year < current.year || (year === current.year && month <= current.month)) {
		months.push({
			year,
			month,
			monthName: MONTH_NAMES[month - 1],
			key: `${year}-${String(month).padStart(2, '0')}`
		});
		month++;
		if (month > 12) {
			month = 1;
			year++;
		}
	}
	return months;
}

export type Balance = {
	balanceCents: number;
	/** `YYYY-MM-DD`, or null when nothing is owed. */
	dueDate: string | null;
};

/**
 * What a tenant owes through the current month, in integer cents. A month with an entry in
 * payment_history owes its `remainingBalance` (never below 0); a month without one owes the rent.
 */
export function computeBalance(input: {
	rent: number;
	moveInMonth?: string;
	histories: Record<string, YearHistory>;
	now: Date;
}): Balance {
	const rentCents = Math.round(input.rent * 100);
	const current = getMonthKey(input.now);
	let balanceCents = 0;
	let oldestUnpaid: MonthKey | undefined;
	let currentUnpaid = false;

	for (const m of monthsOwed(input.moveInMonth, input.now)) {
		const entry = input.histories[String(m.year)]?.[m.monthName];
		const owedCents =
			entry && typeof entry.remainingBalance === 'number'
				? Math.max(0, Math.round(entry.remainingBalance * 100))
				: rentCents;
		if (owedCents > 0) {
			balanceCents += owedCents;
			oldestUnpaid ??= m;
			if (m.key === current.key) currentUnpaid = true;
		}
	}

	if (balanceCents === 0) return { balanceCents: 0, dueDate: null };
	const due = currentUnpaid ? current : oldestUnpaid!;
	return { balanceCents, dueDate: `${due.key}-01` };
}
