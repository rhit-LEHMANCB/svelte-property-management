import type { LeaseStatus } from '$lib/leaseTypes';
import { BUSINESS_TIME_ZONE } from './payments';

/** The stored shape of `leases/{leaseId}`. Dates are calendar days, `YYYY-MM-DD`. */
export type LeaseDoc = {
	propertyId: string;
	tenantIds: string[];
	rent: number;
	startDate: string;
	/** Null for a month-to-month lease. */
	endDate: string | null;
	document: LeaseDocument | null;
	createdAt?: unknown;
	updatedAt?: unknown;
};

export type LeaseDocument = { path: string; fileName: string; size: number; uploadedAt: string };

export type { LeaseStatus };

type Dated = { startDate: string; endDate: string | null };

const dayFormat = new Intl.DateTimeFormat('en-CA', {
	timeZone: BUSINESS_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

/** Today's date in the business time zone, as `YYYY-MM-DD`. */
export function businessToday(now = new Date()): string {
	return dayFormat.format(now);
}

/** Upcoming before the start date, current from start through end (or forever), ended after. */
export function leaseStatus(lease: Dated, today: string): LeaseStatus {
	if (today < lease.startDate) return 'upcoming';
	if (lease.endDate !== null && today > lease.endDate) return 'ended';
	return 'current';
}

/** Whether two leases share at least one day. An open end runs forever. */
export function datesOverlap(a: Dated, b: Dated): boolean {
	return (
		(b.endDate === null || a.startDate <= b.endDate) &&
		(a.endDate === null || b.startDate <= a.endDate)
	);
}

/** The `YYYY-MM` month a lease date falls in. */
export const monthOf = (date: string) => date.slice(0, 7);
