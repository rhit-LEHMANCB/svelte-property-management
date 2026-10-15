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

// Years 2000-2099: a typo such as 1026-08 must not turn into centuries of unpaid rent.
export const RENT_MONTH_PATTERN = /^20\d{2}-(0[1-9]|1[0-2])$/;

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

/**
 * Every month rent is owed for: from the start month (or only the current month when there is none)
 * through the current month, or through the end month when that is earlier. A start month after
 * the last month owes nothing.
 */
export function monthsOwed(
	startMonth: string | undefined,
	now: Date,
	endMonth?: string | null
): MonthKey[] {
	const current = getMonthKey(now);
	let last = { year: current.year, month: current.month };
	if (endMonth && RENT_MONTH_PATTERN.test(endMonth)) {
		const [y, m] = endMonth.split('-').map(Number);
		if (y < last.year || (y === last.year && m < last.month)) last = { year: y, month: m };
	}
	let year = current.year;
	let month = current.month;
	if (startMonth && RENT_MONTH_PATTERN.test(startMonth)) {
		[year, month] = startMonth.split('-').map(Number);
	}
	const months: MonthKey[] = [];
	while (year < last.year || (year === last.year && month <= last.month)) {
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

/** What one month still owes, in cents: its `remainingBalance` (never below 0) or the full rent. */
function monthOwedCents(rent: number, histories: Record<string, YearHistory>, m: MonthKey) {
	const entry = histories[String(m.year)]?.[m.monthName];
	return entry && typeof entry.remainingBalance === 'number'
		? Math.max(0, Math.round(entry.remainingBalance * 100))
		: Math.round(rent * 100);
}

/**
 * Whole-month billing from before proration. Kept only for migration 0001, which must keep
 * reporting the balances it computed then; the app bills through `billing.ts`.
 *
 * What a lease owes through the current month (or its end month), in integer cents. A month with an entry in
 * payment_history owes its `remainingBalance` (never below 0); a month without one owes the rent.
 */
export function computeBalance(input: {
	rent: number;
	startMonth?: string;
	endMonth?: string | null;
	histories: Record<string, YearHistory>;
	now: Date;
}): Balance {
	const current = getMonthKey(input.now);
	let balanceCents = 0;
	let oldestUnpaid: MonthKey | undefined;
	let currentUnpaid = false;

	for (const m of monthsOwed(input.startMonth, input.now, input.endMonth)) {
		const owedCents = monthOwedCents(input.rent, input.histories, m);
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
