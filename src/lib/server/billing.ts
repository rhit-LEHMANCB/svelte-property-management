import { businessToday, leaseStatus, monthOf, type LeaseDoc } from './leaseDates';
import { BUSINESS_TIME_ZONE, monthsOwed, MONTH_NAMES, type MonthKey } from './payments';

/**
 * What a lease owes, worked out from its terms and what has been recorded against it. Everything
 * here is in integer cents; dollars appear only in the stored documents. One function computes the
 * whole picture so the balance, the checkout split, the webhook and the admin pages cannot disagree.
 */

/** Something Firestore stored as a date: a Timestamp (admin SDK or the test fake), a Date or an ISO string. */
export type StoredDate = { toDate(): Date } | Date | string;

export type RentTransaction = { date?: StoredDate; amount?: number; fee?: number };
export type MonthEntry = { remainingBalance?: number; transactions?: RentTransaction[] };
/** A `payment_history/{year}` document: month name -> entry. */
export type HistoryYear = Record<string, MonthEntry | undefined> | undefined;

export type PaymentTransaction = {
	date: StoredDate;
	amount: number;
	invoiceId?: string;
	fee?: number;
};

/** `leases/{id}/late_fees/{YYYY-MM}`: written only once a late fee is paid or waived. */
export type LateFeeRecord = {
	/** The fee in dollars, fixed by the first write. */
	amount: number;
	paid?: number;
	transactions?: PaymentTransaction[];
	waivedAt?: string;
	waivedBy?: string;
};

export type Deduction = { amount: number; reason: string };
export type Settlement = {
	returned: number;
	deductions: Deduction[];
	recordedAt: string;
	recordedBy: string;
};

/** `leases/{id}/deposit/ledger`. */
export type DepositLedger = {
	paid?: number;
	transactions?: PaymentTransaction[];
	settlement?: Settlement | null;
};

export type LeaseTerms = Pick<
	LeaseDoc,
	'rent' | 'startDate' | 'endDate' | 'deposit' | 'lateFee' | 'graceDays' | 'lateFeesFrom'
>;

export const toCents = (dollars: number) => Math.round(dollars * 100);
export const toDollars = (cents: number) => cents / 100;

export { defaultLateFee } from '../lateFee';

// ---- calendar days ----------------------------------------------------------------------------

const dayNumber = (date: string) =>
	Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000;
const fromDayNumber = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** `date` plus `days` calendar days, as `YYYY-MM-DD`. */
export const addDays = (date: string, days: number) => fromDayNumber(dayNumber(date) + days);

const daysInMonth = (year: number, month: number) =>
	new Date(Date.UTC(year, month, 0)).getUTCDate();

const dayFormat = new Intl.DateTimeFormat('en-CA', {
	timeZone: BUSINESS_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

/** The business-time-zone day a stored date falls on, or undefined when it cannot be read. */
export function dayOf(value: StoredDate | undefined): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === 'string')
		return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
	const date = value instanceof Date ? value : value.toDate?.();
	return date && !Number.isNaN(date.getTime()) ? dayFormat.format(date) : undefined;
}

// ---- rent ---------------------------------------------------------------------------------------

/**
 * What a month is charged: the rent times the days the lease covers in it (start and end days
 * included) over the days in the month, to the nearest cent. 0 for a month outside the lease.
 */
export function monthCharge(
	lease: Pick<LeaseTerms, 'rent' | 'startDate' | 'endDate'>,
	month: MonthKey
) {
	const last = daysInMonth(month.year, month.month);
	const first = `${month.key}-01`;
	const end = `${month.key}-${String(last).padStart(2, '0')}`;
	const from = lease.startDate > first ? lease.startDate : first;
	const to = lease.endDate !== null && lease.endDate < end ? lease.endDate : end;
	if (to < from) return 0;
	const days = dayNumber(to) - dayNumber(from) + 1;
	const rentCents = toCents(lease.rent);
	return days === last ? rentCents : Math.round((rentCents * days) / last);
}

/** The first month is due on the start date; every later month on its 1st. */
export const rentDueDate = (lease: Pick<LeaseTerms, 'startDate'>, month: MonthKey) =>
	month.key === monthOf(lease.startDate) ? lease.startDate : `${month.key}-01`;

const monthKeyOf = (key: string): MonthKey => {
	const [year, month] = key.split('-').map(Number);
	return { year, month, monthName: MONTH_NAMES[month - 1], key };
};

const sumCents = (transactions: { amount?: number }[] | undefined) =>
	(transactions ?? []).reduce(
		(sum, t) =>
			sum + (typeof t.amount === 'number' && Number.isFinite(t.amount) ? toCents(t.amount) : 0),
		0
	);

/**
 * What has been paid toward a month's rent: the sum of its transactions. An entry with no
 * transaction amounts but a numeric `remainingBalance` comes from before transactions were the
 * record (or was set by hand); it counts as the rent minus that remainder.
 */
export function monthPaidCents(entry: MonthEntry | undefined, rentCents: number) {
	if (!entry) return 0;
	const fromTransactions = sumCents(entry.transactions);
	if (fromTransactions > 0) return fromTransactions;
	if (typeof entry.remainingBalance === 'number' && Number.isFinite(entry.remainingBalance)) {
		return Math.max(0, rentCents - toCents(entry.remainingBalance));
	}
	return 0;
}

/** Paid toward a month on or before `day` (legacy entries without dated transactions count as on time). */
function monthPaidByCents(entry: MonthEntry | undefined, rentCents: number, day: string) {
	if (!entry) return 0;
	if (sumCents(entry.transactions) === 0) return monthPaidCents(entry, rentCents);
	return sumCents(
		(entry.transactions ?? []).filter((t) => {
			const paidOn = dayOf(t.date);
			return paidOn === undefined || paidOn <= day;
		})
	);
}

// ---- the ledger ---------------------------------------------------------------------------------

export type RentRow = {
	month: MonthKey;
	dueDate: string;
	chargeCents: number;
	paidCents: number;
	/** Credit from other months used to cover this one. */
	creditAppliedCents: number;
	owedCents: number;
	hasEntry: boolean;
};

export type LateFeeRow = {
	month: MonthKey;
	dueDate: string;
	amountCents: number;
	paidCents: number;
	waived: boolean;
	owedCents: number;
};

export type DepositState = {
	amountCents: number;
	dueDate: string | null;
	paidCents: number;
	owedCents: number;
	heldCents: number;
	settlement: Settlement | null;
	/** A settlement exists and accounts for everything paid. */
	settled: boolean;
	/** The lease has ended and holds a deposit that has no matching settlement. */
	toSettle: boolean;
};

export type Ledger = {
	today: string;
	rent: RentRow[];
	lateFees: LateFeeRow[];
	deposit: DepositState;
	creditCents: number;
	owed: { lateFeesCents: number; depositCents: number; rentCents: number };
	totalCents: number;
	/** The earliest due date among what is owed, or null when nothing is. */
	dueDate: string | null;
};

export type LedgerInput = {
	lease: LeaseTerms;
	histories: Record<string, HistoryYear>;
	lateFees?: Record<string, LateFeeRecord | undefined>;
	deposit?: DepositLedger;
	now: Date;
};

/** The years whose `payment_history` documents a ledger needs: every month owed, and the start month's. */
export function ledgerYears(lease: Pick<LeaseTerms, 'startDate' | 'endDate'>, now: Date) {
	const months = monthsOwed(
		monthOf(lease.startDate),
		now,
		lease.endDate ? monthOf(lease.endDate) : null
	);
	return [...new Set([lease.startDate.slice(0, 4), ...months.map((m) => String(m.year))])];
}

export function computeLedger(input: LedgerInput): Ledger {
	const { lease, histories, now } = input;
	const today = businessToday(now);
	const rentCents = toCents(lease.rent);
	const startMonth = monthOf(lease.startDate);
	const endMonth = lease.endDate ? monthOf(lease.endDate) : null;
	const months = monthsOwed(startMonth, now, endMonth);
	const entryOf = (m: MonthKey) => histories[String(m.year)]?.[m.monthName];

	// Rent: each month's charge against what was recorded for it. Anything recorded beyond a
	// month's charge, and anything recorded for a month not yet owed, is credit.
	const rows: RentRow[] = months.map((month) => {
		const entry = entryOf(month);
		const chargeCents = monthCharge(lease, month);
		return {
			month,
			dueDate: rentDueDate(lease, month),
			chargeCents,
			paidCents: monthPaidCents(entry, rentCents),
			creditAppliedCents: 0,
			owedCents: 0,
			hasEntry: entry !== undefined
		};
	});
	const owedKeys = new Set(months.map((m) => m.key));
	let pool = rows.reduce((sum, r) => sum + Math.max(0, r.paidCents - r.chargeCents), 0);
	for (const [year, doc] of Object.entries(histories)) {
		for (const [monthName, entry] of Object.entries(doc ?? {})) {
			const index = MONTH_NAMES.indexOf(monthName);
			if (index < 0) continue;
			const key = `${year}-${String(index + 1).padStart(2, '0')}`;
			if (key < startMonth || owedKeys.has(key)) continue;
			pool += monthPaidCents(entry, rentCents);
		}
	}
	for (const row of rows) {
		const short = Math.max(0, row.chargeCents - row.paidCents);
		row.creditAppliedCents = Math.min(pool, short);
		pool -= row.creditAppliedCents;
		row.owedCents = short - row.creditAppliedCents;
	}

	// Late fees: a month is late when, by the end of its grace period, less than its charge had been
	// paid (credit counts as on time). Months due before `lateFeesFrom` never are.
	const records = input.lateFees ?? {};
	const graceDays = lease.graceDays ?? 0;
	const lateFeeCents = toCents(lease.lateFee ?? 0);
	const lateFees: LateFeeRow[] = [];
	for (const row of rows) {
		const record = records[row.month.key];
		const deadline = addDays(row.dueDate, graceDays);
		const late =
			lease.lateFeesFrom !== undefined &&
			row.dueDate >= lease.lateFeesFrom &&
			deadline < today &&
			monthPaidByCents(entryOf(row.month), rentCents, deadline) + row.creditAppliedCents <
				row.chargeCents;
		if (!late && !record) continue;
		const amountCents = record ? toCents(record.amount) : lateFeeCents;
		if (amountCents <= 0 && !record) continue;
		const paidCents = toCents(record?.paid ?? 0);
		const waived = Boolean(record?.waivedAt);
		lateFees.push({
			month: row.month,
			dueDate: addDays(deadline, 1),
			amountCents,
			paidCents,
			waived,
			owedCents: waived || !late ? 0 : Math.max(0, amountCents - paidCents)
		});
	}

	// Deposit.
	const deposit = input.deposit;
	const amountCents = lease.deposit ? toCents(lease.deposit.amount) : 0;
	const paidCents = toCents(deposit?.paid ?? 0);
	const settlement = deposit?.settlement ?? null;
	const settled =
		settlement !== null &&
		paidCents > 0 &&
		toCents(settlement.returned) +
			settlement.deductions.reduce((s, d) => s + toCents(d.amount), 0) ===
			paidCents;
	const depositState: DepositState = {
		amountCents,
		dueDate: lease.deposit?.dueDate ?? null,
		paidCents,
		owedCents: Math.max(0, amountCents - paidCents),
		heldCents: settled ? 0 : paidCents,
		settlement,
		settled,
		toSettle: !settled && paidCents > 0 && leaseStatus(lease, today) === 'ended'
	};

	const owed = {
		lateFeesCents: lateFees.reduce((s, f) => s + f.owedCents, 0),
		depositCents: depositState.owedCents,
		rentCents: rows.reduce((s, r) => s + r.owedCents, 0)
	};
	const dueDates = [
		...lateFees.filter((f) => f.owedCents > 0).map((f) => f.dueDate),
		...(depositState.owedCents > 0 && depositState.dueDate ? [depositState.dueDate] : []),
		...rows.filter((r) => r.owedCents > 0).map((r) => r.dueDate)
	].sort();

	return {
		today,
		rent: rows,
		lateFees,
		deposit: depositState,
		creditCents: pool,
		owed,
		totalCents: owed.lateFeesCents + owed.depositCents + owed.rentCents,
		dueDate: dueDates[0] ?? null
	};
}

// ---- allocation ---------------------------------------------------------------------------------

export type RentAllocation = { month: MonthKey; cents: number };
export type Allocation = {
	lateFees: { month: MonthKey; cents: number }[];
	depositCents: number;
	rent: RentAllocation[];
};

/**
 * Splits a payment in the fixed order: late fees owed (oldest first), then the unpaid deposit, then
 * rent (oldest month first). Anything beyond what is owed (the checkout cap normally prevents it)
 * goes to the last rent month owed, or to the lease's first month when none is owed yet, where it
 * becomes credit. With `rentOnly`, late fees and the deposit are skipped (invoices from before they
 * existed were all rent).
 */
export function allocate(
	ledger: Ledger,
	lease: Pick<LeaseTerms, 'startDate'>,
	amountCents: number,
	options: { rentOnly?: boolean } = {}
): Allocation {
	let left = amountCents;
	const take = (owed: number) => {
		const cents = Math.min(left, owed);
		left -= cents;
		return cents;
	};

	const lateFees: Allocation['lateFees'] = [];
	let depositCents = 0;
	if (!options.rentOnly) {
		for (const fee of ledger.lateFees) {
			const cents = take(fee.owedCents);
			if (cents > 0) lateFees.push({ month: fee.month, cents });
		}
		depositCents = take(ledger.deposit.owedCents);
	}

	const rent: RentAllocation[] = [];
	for (const row of ledger.rent) {
		const cents = take(row.owedCents);
		if (cents > 0) rent.push({ month: row.month, cents });
	}
	if (left > 0) {
		const month = ledger.rent.at(-1)?.month ?? monthKeyOf(monthOf(lease.startDate));
		const existing = rent.find((a) => a.month.key === month.key);
		if (existing) existing.cents += left;
		else rent.push({ month, cents: left });
	}
	return { lateFees, depositCents, rent };
}

export const allocationParts = (allocation: Allocation) => ({
	lateFeeCents: allocation.lateFees.reduce((s, f) => s + f.cents, 0),
	depositCents: allocation.depositCents,
	rentCents: allocation.rent.reduce((s, r) => s + r.cents, 0)
});
