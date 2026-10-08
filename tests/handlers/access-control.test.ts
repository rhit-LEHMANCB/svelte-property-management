import { describe, expect, it } from 'vitest';
import { load as adminPageLoad } from '../../src/routes/(authenticated)/admin/+page.server';
import { load as layoutLoad } from '../../src/routes/(authenticated)/+layout.server';
import { load as homeLoad } from '../../src/routes/(authenticated)/+page.server';
import { call } from '../helpers/callHandler';
import { linkTenant, seedAdmin, seedProperty, seedTenant } from '../helpers/seed';

describe('access-control: tenant property context (authenticated layout)', () => {
	it('Scenario: anonymous callers are rejected with 401', async () => {
		const result = await call(layoutLoad, { userID: null });
		expect(result).toMatchObject({ status: 401, error: 'You must be logged in to do this.' });
	});

	it('Scenario: a user with no user document is rejected with 401', async () => {
		const result = await call(layoutLoad, { userID: 'ghost' });
		expect(result).toMatchObject({ status: 401, error: 'Failed to retrieve user details' });
	});

	it('Scenario: One property exposes userProperty to child pages', async () => {
		seedTenant('t1');
		seedProperty('p1', { title: 'Oak House' });
		linkTenant('t1', 'p1');

		const result = await call(layoutLoad, { userID: 't1' });

		expect(result.status).toBe(200);
		expect(result.data.user).toMatchObject({ permissions: 'user', firstName: 'Tom' });
		expect(result.data.userProperty).toMatchObject({ id: 'p1', data: { title: 'Oak House' } });
	});

	it('Scenario: No property loads the layout with the user only and no error', async () => {
		seedTenant('t1');

		const result = await call(layoutLoad, { userID: 't1' });

		expect(result.status).toBe(200);
		expect(result.data.user).toMatchObject({ permissions: 'user' });
		expect(result.data).not.toHaveProperty('userProperty');
	});

	it('Scenario: Wrong number of properties (more than one) fails with 500 and the count', async () => {
		seedTenant('t1');
		seedProperty('p1');
		seedProperty('p2');
		linkTenant('t1', 'p1');
		linkTenant('t1', 'p2');

		const result = await call(layoutLoad, { userID: 't1' });

		expect(result).toMatchObject({
			status: 500,
			error: 'User is associated with wrong number of properties: 2'
		});
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
		linkTenant('t1', 'p1');

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
		linkTenant('t1', 'p1');

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

describe('access-control: data is not shared between tenants', () => {
	it("Scenario: each tenant's layout exposes only their own property", async () => {
		seedTenant('t1');
		seedTenant('t2');
		seedProperty('p1', { title: 'One' });
		seedProperty('p2', { title: 'Two' });
		linkTenant('t1', 'p1');
		linkTenant('t2', 'p2');

		const first = await call(layoutLoad, { userID: 't1' });
		const second = await call(layoutLoad, { userID: 't2' });

		expect(first.data.userProperty.data.title).toBe('One');
		expect(second.data.userProperty.data.title).toBe('Two');
	});
});
