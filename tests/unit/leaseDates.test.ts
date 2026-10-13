import { describe, expect, it } from 'vitest';
import { businessToday, datesOverlap, leaseStatus, monthOf } from '$lib/server/leaseDates';

// leases: Lease status, and the date overlap behind Lease conflicts and Overlap warning.
describe('leases: Lease status', () => {
	const today = '2026-10-13';

	it('Scenario: Current lease', () => {
		expect(leaseStatus({ startDate: '2026-09-01', endDate: '2027-08-31' }, today)).toBe('current');
	});

	it('Scenario: Ended lease', () => {
		expect(leaseStatus({ startDate: '2025-10-01', endDate: '2026-09-30' }, today)).toBe('ended');
	});

	it('Scenario: Upcoming lease', () => {
		expect(leaseStatus({ startDate: '2026-11-01', endDate: null }, today)).toBe('upcoming');
	});

	it('is current on its first and last day, and forever without an end date', () => {
		expect(leaseStatus({ startDate: today, endDate: '2027-01-01' }, today)).toBe('current');
		expect(leaseStatus({ startDate: '2026-01-01', endDate: today }, today)).toBe('current');
		expect(leaseStatus({ startDate: '2020-01-01', endDate: null }, today)).toBe('current');
	});
});

describe('businessToday', () => {
	it('uses the business time zone, not UTC', () => {
		// 02:30 UTC on Nov 1 is still Oct 31 in Indianapolis.
		expect(businessToday(new Date('2026-11-01T02:30:00Z'))).toBe('2026-10-31');
		expect(businessToday(new Date('2026-11-01T12:00:00Z'))).toBe('2026-11-01');
	});
});

describe('datesOverlap', () => {
	const lease = (startDate: string, endDate: string | null) => ({ startDate, endDate });

	it('Scenario: Back-to-back leases do not overlap', () => {
		expect(datesOverlap(lease('2025-11-01', '2026-10-31'), lease('2026-11-01', null))).toBe(false);
	});

	it('leases sharing a day overlap, in either order', () => {
		const a = lease('2026-01-01', '2026-06-30');
		const b = lease('2026-06-30', '2026-12-31');
		expect(datesOverlap(a, b)).toBe(true);
		expect(datesOverlap(b, a)).toBe(true);
	});

	it('an open-ended lease overlaps any later lease', () => {
		expect(datesOverlap(lease('2026-01-01', null), lease('2030-01-01', '2030-02-01'))).toBe(true);
		expect(datesOverlap(lease('2026-01-01', null), lease('2025-01-01', null))).toBe(true);
	});

	it('a lease that ends before another starts does not overlap', () => {
		expect(datesOverlap(lease('2026-01-01', '2026-03-01'), lease('2026-04-01', null))).toBe(false);
	});
});

describe('monthOf', () => {
	it('is the YYYY-MM of the date', () => {
		expect(monthOf('2026-03-15')).toBe('2026-03');
	});
});
