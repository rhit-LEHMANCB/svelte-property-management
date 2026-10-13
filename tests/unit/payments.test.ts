import { describe, expect, it } from 'vitest';
import {
	allocatePayment,
	computeBalance,
	getMonthKey,
	monthsOwed
} from '../../src/lib/server/payments';

const at = (iso: string) => new Date(iso);

describe('getMonthKey', () => {
	it('uses the business time zone, not UTC', () => {
		// 23:30 on 31 March in Indianapolis (EDT, UTC-4) is already April in UTC.
		expect(getMonthKey(at('2026-04-01T03:30:00Z'))).toMatchObject({
			month: 3,
			monthName: 'March',
			key: '2026-03'
		});
		expect(getMonthKey(at('2026-04-01T04:00:00Z'))).toMatchObject({ month: 4, key: '2026-04' });
	});

	it('rolls the year at local midnight on 1 January', () => {
		expect(getMonthKey(at('2027-01-01T04:59:00Z'))).toMatchObject({ year: 2026, month: 12 });
		expect(getMonthKey(at('2027-01-01T05:00:00Z'))).toMatchObject({ year: 2027, month: 1 });
	});
});

describe('computeBalance', () => {
	const now = at('2026-03-15T16:00:00Z');

	it('owes the rent when nothing has been paid, due on the 1st of this month', () => {
		expect(computeBalance({ rent: 1000, startMonth: '2026-03', histories: {}, now })).toEqual({
			balanceCents: 100000,
			dueDate: '2026-03-01'
		});
	});

	it('subtracts a partial payment', () => {
		const histories = { '2026': { March: { remainingBalance: 600 } } };
		expect(computeBalance({ rent: 1000, histories, now })).toEqual({
			balanceCents: 60000,
			dueDate: '2026-03-01'
		});
	});

	it('counts only the current month when there is no startMonth', () => {
		expect(computeBalance({ rent: 1000, histories: {}, now }).balanceCents).toBe(100000);
	});

	it('carries unpaid months over a year boundary', () => {
		const histories = { '2025': { December: { remainingBalance: 250.5 } } };
		const result = computeBalance({ rent: 1000, startMonth: '2025-12', histories, now });
		// December remainder + January + February + March
		expect(result).toEqual({ balanceCents: 25050 + 300000, dueDate: '2026-03-01' });
	});

	it('is paid in full when every month is settled', () => {
		const histories = {
			'2026': {
				January: { remainingBalance: 0 },
				February: { remainingBalance: 0 },
				March: { remainingBalance: 0 }
			}
		};
		expect(computeBalance({ rent: 1000, startMonth: '2026-01', histories, now })).toEqual({
			balanceCents: 0,
			dueDate: null
		});
	});

	it('floors an overpaid month at 0 without offsetting other months', () => {
		const histories = {
			'2026': { February: { remainingBalance: -200 }, March: { remainingBalance: 1000 } }
		};
		expect(computeBalance({ rent: 1000, startMonth: '2026-02', histories, now }).balanceCents).toBe(
			100000
		);
	});

	it('due date is the oldest unpaid month when this month is settled', () => {
		const histories = { '2026': { March: { remainingBalance: 0 } } };
		expect(computeBalance({ rent: 1000, startMonth: '2026-02', histories, now })).toEqual({
			balanceCents: 100000,
			dueDate: '2026-02-01'
		});
	});

	it('uses the business month near midnight', () => {
		// 00:30 UTC on 1 April is still 31 March in Indianapolis.
		const edge = at('2026-04-01T00:30:00Z');
		expect(computeBalance({ rent: 1000, histories: {}, now: edge }).dueDate).toBe('2026-03-01');
	});

	it('rent-payments: Upcoming lease owes nothing yet', () => {
		expect(computeBalance({ rent: 1000, startMonth: '2026-04', histories: {}, now })).toEqual({
			balanceCents: 0,
			dueDate: null
		});
	});

	it('rent-payments: Ended lease stops at its end month and keeps its unpaid balance', () => {
		// Ended in January with December and January unpaid; February and March are not owed.
		expect(
			computeBalance({
				rent: 1000,
				startMonth: '2025-12',
				endMonth: '2026-01',
				histories: {},
				now
			})
		).toEqual({ balanceCents: 200000, dueDate: '2025-12-01' });
	});

	it('an end month after this month does not extend the balance past this month', () => {
		expect(
			computeBalance({ rent: 1000, startMonth: '2026-03', endMonth: '2027-02', histories: {}, now })
				.balanceCents
		).toBe(100000);
	});

	it('works in integer cents', () => {
		expect(computeBalance({ rent: 1000.1, histories: {}, now }).balanceCents).toBe(100010);
	});
});

describe('monthsOwed', () => {
	const now = at('2026-03-15T16:00:00Z');
	const keys = (start?: string, end?: string | null) =>
		monthsOwed(start, now, end).map((m) => m.key);

	it('runs from the start month through this month', () => {
		expect(keys('2025-12')).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
	});

	it('stops at an earlier end month, across a year boundary', () => {
		expect(keys('2025-11', '2026-01')).toEqual(['2025-11', '2025-12', '2026-01']);
	});

	it('is empty for a lease that starts after this month', () => {
		expect(keys('2026-04')).toEqual([]);
	});

	it('ignores a malformed end month', () => {
		expect(keys('2026-02', '1026-01')).toEqual(['2026-02', '2026-03']);
	});
});

describe('allocatePayment', () => {
	const now = at('2026-03-15T16:00:00Z');

	it('pays the oldest unpaid months of an ended lease first and nothing after its end', () => {
		const allocations = allocatePayment({
			rent: 1000,
			startMonth: '2025-12',
			endMonth: '2026-01',
			histories: {},
			now,
			amountCents: 150000
		});
		expect(allocations.map((a) => [a.month.key, a.cents])).toEqual([
			['2025-12', 100000],
			['2026-01', 50000]
		]);
	});

	it('puts anything beyond what is owed on the last month owed', () => {
		const allocations = allocatePayment({
			rent: 1000,
			startMonth: '2026-01',
			endMonth: '2026-01',
			histories: {},
			now,
			amountCents: 120000
		});
		expect(allocations.map((a) => [a.month.key, a.cents])).toEqual([['2026-01', 120000]]);
	});

	it('records a payment against a lease that owes nothing yet in this month', () => {
		const allocations = allocatePayment({
			rent: 1000,
			startMonth: '2026-06',
			histories: {},
			now,
			amountCents: 5000
		});
		expect(allocations.map((a) => [a.month.key, a.cents])).toEqual([['2026-03', 5000]]);
	});
});
