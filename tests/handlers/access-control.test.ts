import { describe, expect, it, vi } from 'vitest';
import { load as adminPageLoad } from '../../src/routes/(authenticated)/admin/+page.server';
import { load as layoutLoad } from '../../src/routes/(authenticated)/+layout.server';
import { load as homeLoad } from '../../src/routes/(authenticated)/+page.server';
import { call } from '../helpers/callHandler';
import { db, seedAdmin, seedLease, seedProperty, seedTenant } from '../helpers/seed';

describe('access-control: tenant property context (authenticated layout)', () => {
	it('Scenario: anonymous callers are rejected with 401', async () => {
		const result = await call(layoutLoad, { userID: null });
		expect(result).toMatchObject({ status: 401, error: 'You must be logged in to do this.' });
	});

	it('Scenario: a user with no user document is rejected with 401', async () => {
		const result = await call(layoutLoad, { userID: 'ghost' });
		expect(result).toMatchObject({ status: 401, error: 'Failed to retrieve user details' });
	});

	it("Scenario: One property: the current lease's property is exposed to child pages", async () => {
		seedTenant('t1');
		seedTenant('t2', { firstName: 'Tess', lastName: 'Two' });
		seedProperty('p1', { title: 'Oak House', streetAddress: '9 Oak Ave', city: 'Brazil' });
		seedLease('l1', {
			propertyId: 'p1',
			tenantIds: ['t1', 't2'],
			startDate: '2020-01-01',
			document: { path: 'leases/l1/1.pdf', fileName: 'l.pdf', size: 1, uploadedAt: 'x' }
		});

		const result = await call(layoutLoad, { userID: 't1' });

		expect(result.status).toBe(200);
		expect(result.data.user).toMatchObject({ permissions: 'user', firstName: 'Tom' });
		expect(result.data.userProperty).toMatchObject({ id: 'p1', data: { title: 'Oak House' } });
		expect(result.data.userLeases).toEqual([
			{
				id: 'l1',
				propertyId: 'p1',
				address: '9 Oak Ave, Brazil',
				rent: 1200,
				startDate: '2020-01-01',
				endDate: null,
				status: 'current',
				hasDocument: true,
				deposit: null
			}
		]);
	});

	it('Scenario: No property: never added to a lease', async () => {
		seedTenant('t1');

		const result = await call(layoutLoad, { userID: 't1' });

		expect(result.status).toBe(200);
		expect(result.data.user).toMatchObject({ permissions: 'user' });
		expect(result.data).not.toHaveProperty('userProperty');
		expect(result.data.userLeases).toEqual([]);
	});

	it('Scenario: No property: the lease has not started, or it has ended', async () => {
		seedTenant('t1');
		seedProperty('p1');
		seedLease('future', { propertyId: 'p1', tenantIds: ['t1'], startDate: '2099-01-01' });
		seedLease('past', {
			propertyId: 'p1',
			tenantIds: ['t1'],
			startDate: '2019-01-01',
			endDate: '2019-12-31'
		});

		const result = await call(layoutLoad, { userID: 't1' });

		expect(result.status).toBe(200);
		expect(result.data).not.toHaveProperty('userProperty');
		expect(
			result.data.userLeases.map((l: { id: string; status: string }) => [l.id, l.status])
		).toEqual([
			['future', 'upcoming'],
			['past', 'ended']
		]);
	});

	it("Scenario: No property: the current lease's property was deleted", async () => {
		seedTenant('t1');
		seedLease('l1', { propertyId: 'gone', tenantIds: ['t1'], startDate: '2020-01-01' });

		const result = await call(layoutLoad, { userID: 't1' });

		expect(result.status).toBe(200);
		expect(result.data).not.toHaveProperty('userProperty');
	});

	it('Scenario: Wrong number of properties: several current leases use the latest start', async () => {
		seedTenant('t1');
		seedProperty('p1', { title: 'Older' });
		seedProperty('p2', { title: 'Newer' });
		seedLease('l1', { propertyId: 'p1', tenantIds: ['t1'], startDate: '2020-01-01' });
		seedLease('l2', { propertyId: 'p2', tenantIds: ['t1'], startDate: '2021-01-01' });

		const result = await call(layoutLoad, { userID: 't1' });

		expect(result.status).toBe(200);
		expect(result.data.userProperty).toMatchObject({ id: 'p2', data: { title: 'Newer' } });
	});

	it('Scenario: admins need no property and get only their user data', async () => {
		seedAdmin('a1');

		const result = await call(layoutLoad, { userID: 'a1' });

		expect(result.status).toBe(200);
		expect(result.data.user).toMatchObject({ permissions: 'admin' });
		expect(result.data).not.toHaveProperty('userProperty');
	});
});

describe('access-control: tenant-only routes redirect admins', () => {
	const routes = [
		'/(authenticated)/maintenance',
		'/(authenticated)/insurance',
		'/(authenticated)/payment',
		'/(authenticated)/payment/success'
	];

	it.each(routes)('Scenario: an admin opening %s is redirected 303 to /admin', async (routeId) => {
		seedAdmin('a1');

		const result = await call(layoutLoad, { userID: 'a1', routeId });

		expect(result).toMatchObject({ status: 303, redirect: '/admin' });
	});

	it.each(routes)('Scenario: a tenant opening %s loads', async (routeId) => {
		seedTenant('t1');
		seedProperty('p1');
		seedLease('l1', { propertyId: 'p1', tenantIds: ['t1'], startDate: '2020-01-01' });

		const result = await call(layoutLoad, { userID: 't1', routeId });

		expect(result.status).toBe(200);
	});

	it('Scenario: an admin on other routes is not redirected', async () => {
		seedAdmin('a1');

		for (const routeId of [
			'/(authenticated)/admin',
			'/(authenticated)/admin/users',
			'/(authenticated)/paymentx'
		]) {
			expect((await call(layoutLoad, { userID: 'a1', routeId })).status).toBe(200);
		}
	});

	it('Scenario: /admin requires an admin (tenant 401, admin loads)', async () => {
		seedTenant('t1');
		seedAdmin('a1');

		expect((await call(adminPageLoad, { userID: 't1' })).status).toBe(401);
		expect((await call(adminPageLoad, { userID: null })).status).toBe(401);
		expect((await call(adminPageLoad, { userID: 'a1' })).status).toBe(200);
	});
});

describe('access-control: first login redirect', () => {
	it('Scenario: Flagged user is redirected 303 to /profile', async () => {
		seedTenant('t1', { isFirstLogin: true });

		const result = await call(layoutLoad, { userID: 't1' });

		expect(result).toMatchObject({ status: 303, redirect: '/profile' });
	});

	it('Scenario: the redirect applies to admins too, before any role handling', async () => {
		seedAdmin('a1', { isFirstLogin: true });

		const result = await call(layoutLoad, { userID: 'a1' });

		expect(result).toMatchObject({ status: 303, redirect: '/profile' });
	});

	it('Scenario: a user without the flag is not redirected', async () => {
		seedAdmin('a1');
		seedTenant('t1', { isFirstLogin: false });
		seedProperty('p1');
		seedLease('l1', { propertyId: 'p1', tenantIds: ['t1'], startDate: '2020-01-01' });

		for (const userID of ['a1', 't1']) {
			const result = await call(layoutLoad, { userID });
			expect(result.redirect).toBeUndefined();
			expect(result.status).toBe(200);
		}
	});
});

describe('access-control: role-based landing (home page load)', () => {
	it('Scenario: Admin visits home and is redirected 303 to /admin', async () => {
		seedAdmin('a1');

		const result = await call(homeLoad, { userID: 'a1' });

		expect(result).toMatchObject({ status: 303, redirect: '/admin' });
	});

	it('Scenario: a tenant stays on the home page', async () => {
		seedTenant('t1');

		const result = await call(homeLoad, { userID: 't1' });

		expect(result).toMatchObject({ status: 200, data: {} });
	});

	it('Scenario: anonymous callers are rejected with 401', async () => {
		expect((await call(homeLoad, { userID: null })).status).toBe(401);
	});
});

describe('leases: Tenant lease card (dashboard load)', () => {
	it('Scenario: Current lease: the card data names the other tenants, never their emails', async () => {
		seedTenant('t1');
		seedTenant('t2', { firstName: 'Tess', lastName: 'Two' });
		seedProperty('p1', { streetAddress: '9 Oak Ave', city: 'Brazil' });
		seedLease('l1', { propertyId: 'p1', tenantIds: ['t1', 't2'], startDate: '2020-01-01' });

		const result = await call(homeLoad, { userID: 't1' });

		expect(result.data.leaseCards).toEqual([
			expect.objectContaining({
				id: 'l1',
				address: '9 Oak Ave, Brazil',
				otherTenants: ['Tess Two']
			})
		]);
		expect(JSON.stringify(result.data)).not.toContain('t2@example.com');
	});

	it('Scenario: Deposit and late-fee terms are on the card; an ended lease with a settled deposit shows the settlement', async () => {
		seedTenant('t1');
		seedProperty('p1');
		seedLease('l1', {
			propertyId: 'p1',
			tenantIds: ['t1'],
			startDate: '2099-01-01',
			deposit: { amount: 1000, dueDate: '2099-01-01' },
			lateFee: 75,
			graceDays: 5,
			lateFeesFrom: '2026-01-01'
		});
		db.seed('leases/l1/deposit/ledger', { paid: 400 });
		seedLease('old', {
			propertyId: 'p1',
			tenantIds: ['t1'],
			startDate: '2020-01-01',
			endDate: '2020-12-31',
			deposit: { amount: 1000, dueDate: '2020-01-01' }
		});
		db.seed('leases/old/deposit/ledger', {
			paid: 1000,
			settlement: {
				returned: 800,
				deductions: [{ amount: 200, reason: 'Carpet cleaning' }],
				recordedAt: '2021-01-05T00:00:00Z',
				recordedBy: 'admin'
			}
		});
		// An ended lease without a deposit is not shown.
		seedLease('older', {
			propertyId: 'p1',
			tenantIds: ['t1'],
			startDate: '2019-01-01',
			endDate: '2019-12-31'
		});

		const result = await call(homeLoad, { userID: 't1' });

		expect(result.data.leaseCards.map((c: { id: string }) => c.id)).toEqual(['l1', 'old']);
		expect(result.data.leaseCards[0]).toMatchObject({
			deposit: { amount: 1000, dueDate: '2099-01-01' },
			lateFee: 75,
			graceDays: 5,
			billing: { deposit: { paidCents: 40000, heldCents: 40000 } }
		});
		expect(result.data.leaseCards[1].billing.deposit).toMatchObject({
			settled: true,
			settlement: { returned: 800, deductions: [{ amount: 200, reason: 'Carpet cleaning' }] }
		});
	});

	it("Scenario: Another tenant's lease: its deposit and settlement are not shown", async () => {
		seedTenant('t1');
		seedTenant('t2');
		seedProperty('p1');
		seedLease('theirs', {
			propertyId: 'p1',
			tenantIds: ['t2'],
			startDate: '2020-01-01',
			endDate: '2020-12-31',
			deposit: { amount: 1000, dueDate: '2020-01-01' }
		});
		db.seed('leases/theirs/deposit/ledger', { paid: 1000 });

		const result = await call(homeLoad, { userID: 't1' });

		expect(result.data.leaseCards).toEqual([]);
	});

	it('the layout does not load the other tenants (only the dashboard does)', async () => {
		seedTenant('t1');
		seedTenant('t2');
		seedProperty('p1');
		seedLease('l1', { propertyId: 'p1', tenantIds: ['t1', 't2'], startDate: '2020-01-01' });

		const result = await call(layoutLoad, { userID: 't1' });

		expect(result.data.userLeases[0]).not.toHaveProperty('otherTenants');
	});
});

describe('access-control: data is not shared between tenants', () => {
	it("Scenario: each tenant's layout exposes only their own property", async () => {
		seedTenant('t1');
		seedTenant('t2');
		seedProperty('p1', { title: 'One' });
		seedProperty('p2', { title: 'Two' });
		seedLease('l1', { propertyId: 'p1', tenantIds: ['t1'], startDate: '2020-01-01' });
		seedLease('l2', { propertyId: 'p2', tenantIds: ['t2'], startDate: '2020-01-01' });

		const first = await call(layoutLoad, { userID: 't1' });
		const second = await call(layoutLoad, { userID: 't2' });

		expect(first.data.userProperty.data.title).toBe('One');
		expect(second.data.userProperty.data.title).toBe('Two');
		expect(first.data.userLeases.map((l: { id: string }) => l.id)).toEqual(['l1']);
		expect(second.data.userLeases.map((l: { id: string }) => l.id)).toEqual(['l2']);
	});
});

// #165: a tenant whose only lease has not started was told no property is assigned.
describe('access-control: dashboard notice for a tenant without a current lease', () => {
	const upcoming = () => {
		seedTenant('t1');
		seedProperty('p1', {
			streetAddress: '570 Maple Ave',
			apartmentInfo: 'Apt 317',
			city: 'Noblesville'
		});
		seedLease('soon', {
			propertyId: 'p1',
			tenantIds: ['t1'],
			rent: 1600,
			startDate: '2099-10-23',
			deposit: { amount: 500, dueDate: '2099-10-23' }
		});
	};

	it('Scenario: an upcoming lease is named with its start date and what is owed now', async () => {
		upcoming();
		const result = await call(homeLoad, { userID: 't1', parent: {} });
		expect(result.data.notice).toEqual({
			kind: 'upcoming',
			address: '570 Maple Ave, Apt 317, Noblesville',
			startDate: '2099-10-23',
			owedCents: 50000
		});
	});

	it('Scenario: nothing owed yet: the notice has 0 to pay (the page offers autopay setup)', async () => {
		seedTenant('t1');
		seedProperty('p1', { streetAddress: '1 Far St', apartmentInfo: '', city: 'Carmel' });
		seedLease('far', { propertyId: 'p1', tenantIds: ['t1'], startDate: '2099-10-23' });
		const result = await call(homeLoad, { userID: 't1', parent: {} });
		expect(result.data.notice).toMatchObject({ kind: 'upcoming', owedCents: 0 });
	});

	it('Scenario: rent payable 7 days early counts as owed now', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-16T16:00:00Z'));
		try {
			seedTenant('t1');
			seedProperty('p1', { streetAddress: '1 Soon St', apartmentInfo: '', city: 'Carmel' });
			seedLease('soon', {
				propertyId: 'p1',
				tenantIds: ['t1'],
				rent: 1550,
				startDate: '2026-10-23'
			});
			const result = await call(homeLoad, { userID: 't1', parent: {} });
			// October 23 to 31: 9 of 31 days of $1,550.
			expect(result.data.notice).toMatchObject({ kind: 'upcoming', owedCents: 45000 });
		} finally {
			vi.useRealTimers();
		}
	});

	it('Scenario: with two upcoming leases the one starting first is named', async () => {
		seedTenant('t1');
		seedProperty('p1', { streetAddress: '1 Later St', apartmentInfo: '', city: 'Carmel' });
		seedProperty('p2', { streetAddress: '2 First St', apartmentInfo: '', city: 'Carmel' });
		seedLease('later', { propertyId: 'p1', tenantIds: ['t1'], startDate: '2099-12-01' });
		seedLease('first', { propertyId: 'p2', tenantIds: ['t1'], startDate: '2099-11-01' });
		const result = await call(homeLoad, { userID: 't1', parent: {} });
		expect(result.data.notice).toMatchObject({
			address: '2 First St, Carmel',
			startDate: '2099-11-01'
		});
	});

	it('Scenario: no lease at all keeps the contact-your-manager notice', async () => {
		seedTenant('t1');
		const result = await call(homeLoad, { userID: 't1', parent: {} });
		expect(result.data.notice).toEqual({ kind: 'none' });
	});

	it('Scenario: a tenant with a current property gets no notice', async () => {
		upcoming();
		const result = await call(homeLoad, {
			userID: 't1',
			parent: { userProperty: { id: 'p1', data: {} } }
		});
		expect(result.data.notice).toBeNull();
	});
});
