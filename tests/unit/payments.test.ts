import { describe, expect, it } from 'vitest';
import { computeBalance, getMonthKey } from '../../src/lib/server/payments';

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
		expect(computeBalance({ rent: 1000, moveInMonth: '2026-03', histories: {}, now })).toEqual({
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

	it('counts only the current month when there is no moveInMonth', () => {
		expect(computeBalance({ rent: 1000, histories: {}, now }).balanceCents).toBe(100000);
	});

	it('carries unpaid months over a year boundary', () => {
		const histories = { '2025': { December: { remainingBalance: 250.5 } } };
		const result = computeBalance({ rent: 1000, moveInMonth: '2025-12', histories, now });
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
		expect(computeBalance({ rent: 1000, moveInMonth: '2026-01', histories, now })).toEqual({
			balanceCents: 0,
			dueDate: null
		});
	});

	it('floors an overpaid month at 0 without offsetting other months', () => {
		const histories = {
			'2026': { February: { remainingBalance: -200 }, March: { remainingBalance: 1000 } }
		};
		expect(
			computeBalance({ rent: 1000, moveInMonth: '2026-02', histories, now }).balanceCents
		).toBe(100000);
	});

	it('due date is the oldest unpaid month when this month is settled', () => {
		const histories = { '2026': { March: { remainingBalance: 0 } } };
		expect(computeBalance({ rent: 1000, moveInMonth: '2026-02', histories, now })).toEqual({
			balanceCents: 100000,
			dueDate: '2026-02-01'
		});
	});

	it('uses the business month near midnight', () => {
		// 00:30 UTC on 1 April is still 31 March in Indianapolis.
		const edge = at('2026-04-01T00:30:00Z');
		expect(computeBalance({ rent: 1000, histories: {}, now: edge }).dueDate).toBe('2026-03-01');
	});

	it('treats a future moveInMonth as the current month only', () => {
		expect(
			computeBalance({ rent: 1000, moveInMonth: '2027-01', histories: {}, now }).balanceCents
		).toBe(100000);
	});

	it('works in integer cents', () => {
		expect(computeBalance({ rent: 1000.1, histories: {}, now }).balanceCents).toBe(100010);
	});
});
