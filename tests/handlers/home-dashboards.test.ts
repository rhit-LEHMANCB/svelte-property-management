import { describe, expect, it } from 'vitest';
import { load as adminPageLoad } from '../../src/routes/(authenticated)/admin/+page.server';
import { load as layoutLoad } from '../../src/routes/(authenticated)/+layout.server';
import { load as homeLoad } from '../../src/routes/(authenticated)/+page.server';
import { call } from '../helpers/callHandler';
import { db, seedAdmin, seedLease, seedProperty, seedTenant } from '../helpers/seed';

// home-dashboards: the tenant summary tiles and the admin needs-attention list.

/** The dashboard load as the app runs it: with the layout's tenant leases as its parent. */
async function dashboardOf(uid: string) {
	const layout = await call(layoutLoad, { userID: uid });
	return call(homeLoad, { userID: uid, parent: layout.data });
}

const openRequest = (id: string, propertyId: string) =>
	db.seed(`maintenance/${id}`, {
		subject: 'Leak',
		description: 'Drips',
		status: 'Open',
		propertyId,
		dateAdded: new Date('2026-01-01T00:00:00Z')
	});

describe('home-dashboards: Tenant summary tiles', () => {
	it('Scenario: Balance owed, autopay and open requests come from the tenant’s own lease and property', async () => {
		seedTenant('t1', { insurance: { companyName: 'Acme', endDate: '2099-01-01' } });
		seedProperty('p1');
		seedLease('l1', { propertyId: 'p1', tenantIds: ['t1'], rent: 1000, startDate: '2020-01-01' });
		db.seed('leases/l1/autopay/t1', {
			paymentMethodId: 'pm_t1',
			type: 'card',
			brand: 'visa',
			last4: '4242',
			amountCents: null,
			enrolledAt: '2026-01-01T00:00:00.000Z'
		});
		openRequest('r1', 'p1');
		openRequest('r2', 'p1');
		db.seed('maintenance/r3', { subject: 'Done', status: 'Closed', propertyId: 'p1' });

		const { data } = await dashboardOf('t1');

		expect(data.summary.balanceCents).toBeGreaterThan(0);
		expect(data.summary.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(data.summary.autopayOn).toBe(true);
		expect(data.summary.openRequests).toBe(2);
		expect(data.summary.insurance).toMatchObject({ state: 'on-file', endDate: '2099-01-01' });
	});

	it('Scenario: Another household’s data never counts', async () => {
		seedTenant('t1');
		seedTenant('t2');
		seedProperty('p1');
		seedProperty('p2');
		seedLease('mine', { propertyId: 'p1', tenantIds: ['t1'], startDate: '2099-01-01' });
		seedLease('theirs', {
			propertyId: 'p2',
			tenantIds: ['t2'],
			rent: 5000,
			startDate: '2020-01-01'
		});
		db.seed('leases/theirs/autopay/t2', {
			paymentMethodId: 'pm_t2',
			type: 'card',
			amountCents: null,
			enrolledAt: '2026-01-01T00:00:00.000Z'
		});
		openRequest('r1', 'p2');

		const { data } = await dashboardOf('t1');

		expect(data.summary).toMatchObject({
			balanceCents: 0,
			dueDate: null,
			autopayOn: false,
			openRequests: 0,
			insurance: { state: 'missing' }
		});
	});
});

describe('home-dashboards: Admin needs-attention list', () => {
	it('Scenario: Counts open requests, deposits to settle and failed autopay that is still owed', async () => {
		seedAdmin('a1');
		seedTenant('t1');
		seedProperty('p1');
		openRequest('r1', 'p1');
		openRequest('r2', 'p1');
		db.seed('maintenance/r3', { subject: 'Done', status: 'Closed', propertyId: 'p1' });
		// Ended with $1,000 held: to settle. Ended and settled: not counted.
		seedLease('ended', {
			propertyId: 'p1',
			tenantIds: ['t1'],
			startDate: '2020-01-01',
			endDate: '2020-12-31',
			deposit: { amount: 1000, dueDate: '2020-01-01' }
		});
		db.seed('leases/ended/deposit/ledger', { paid: 1000 });
		seedLease('settled', {
			propertyId: 'p1',
			tenantIds: ['t1'],
			startDate: '2019-01-01',
			endDate: '2019-12-31',
			deposit: { amount: 500, dueDate: '2019-01-01' }
		});
		db.seed('leases/settled/deposit/ledger', {
			paid: 500,
			settlement: { returned: 500, deductions: [], settledAt: '2020-01-05T00:00:00.000Z' }
		});
		// A current lease owing rent whose latest charge gave up, and one whose charge succeeded.
		const charge = (state: string) => ({
			uid: 't1',
			cycleKey: '2026-10-01',
			state,
			attempts: 4,
			lastAttemptDay: '2026-10-04',
			claimedAt: '2026-10-01T10:58:00.000Z',
			amountCents: 100000,
			feeCents: 0
		});
		seedLease('owing', {
			propertyId: 'p1',
			tenantIds: ['t1'],
			rent: 1000,
			startDate: '2026-01-01'
		});
		db.seed('leases/owing/autopay_charges/2026-10-01_t1', charge('gave-up'));
		seedLease('paid', { propertyId: 'p1', tenantIds: ['t1'], rent: 1000, startDate: '2026-01-01' });
		db.seed('leases/paid/autopay_charges/2026-10-01_t1', charge('succeeded'));

		const { data } = await call(adminPageLoad, { userID: 'a1' });

		expect(data.attention).toEqual({ openRequests: 2, depositsToSettle: 1, failedAutopay: 1 });
	});

	it('Scenario: Tenant: no counts are loaded', async () => {
		seedTenant('t1');
		const result = await call(adminPageLoad, { userID: 't1' });
		expect(result.status).toBe(401);
		expect(result.data).toBeUndefined();
	});
});
