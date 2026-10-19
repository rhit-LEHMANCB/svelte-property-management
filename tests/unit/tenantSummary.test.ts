import { describe, expect, it } from 'vitest';
import { insuranceStatus } from '$lib/server/tenantSummary';

describe('insuranceStatus', () => {
	const today = '2026-10-18';
	const policy = (endDate: string) => ({ companyName: 'Acme Mutual', endDate });

	it.each([
		['2026-11-18', 'on-file'], // 31 days out
		['2026-11-17', 'ending-soon'], // 30 days out
		['2026-10-18', 'ending-soon'], // ends today
		['2026-10-17', 'expired']
	])('a policy ending %s is %s', (endDate, state) => {
		expect(insuranceStatus(policy(endDate), today)).toEqual({
			state,
			endDate,
			companyName: 'Acme Mutual'
		});
	});

	it('is missing without a policy or an end date', () => {
		expect(insuranceStatus(undefined, today)).toEqual({ state: 'missing' });
		expect(insuranceStatus({ companyName: 'Acme' }, today)).toEqual({ state: 'missing' });
		expect(insuranceStatus({ endDate: 'not a date' }, today)).toEqual({ state: 'missing' });
	});
});
