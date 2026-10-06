import { describe, expect, it } from 'vitest';
import {
	DELETE as removeTenant,
	PATCH as updateTenant,
	POST as assignTenant
} from '../../src/routes/api/property/[propertyId]/tenants/+server';
import { GET as lookupProperty } from '../../src/routes/api/user/[userId]/assoc/+server';
import { load as editLoad } from '../../src/routes/(authenticated)/admin/properties/[propertyId]/edit/+page.server';
import { getMonthKey } from '../../src/lib/server/payments';
import { call } from '../helpers/callHandler';
import { db, linkTenant, seedAdmin, seedProperty, seedTenant } from '../helpers/seed';

describe('tenant-assignment: assign tenant (POST /api/property/{id}/tenants)', () => {
	it('Scenario: Assign writes the junction document {tenantId}_{propertyId}', async () => {
		seedAdmin('admin-1');

		const result = await call(assignTenant, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			body: { tenantId: 'tenant-1' }
		});

		expect(result).toMatchObject({ status: 200, json: { status: 'Tenant added' } });
		expect(db.peek('junction_user_property/tenant-1_prop-1')).toEqual({
			tenantId: 'tenant-1',
			propertyId: 'prop-1',
			moveInMonth: getMonthKey(new Date()).key
		});
	});

	it('Scenario: an explicit moveInMonth is stored', async () => {
		seedAdmin('admin-1');

		const result = await call(assignTenant, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			body: { tenantId: 'tenant-1', moveInMonth: '2026-08' }
		});

		expect(result.status).toBe(200);
		expect(db.peek('junction_user_property/tenant-1_prop-1')).toMatchObject({
			moveInMonth: '2026-08'
		});
	});

	it('Scenario: re-assigning a tenant keeps their stored moveInMonth', async () => {
		seedAdmin('admin-1');
		db.seed('junction_user_property/tenant-1_prop-1', {
			tenantId: 'tenant-1',
			propertyId: 'prop-1',
			moveInMonth: '2026-02'
		});

		await call(assignTenant, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			body: { tenantId: 'tenant-1' }
		});

		expect(db.peek('junction_user_property/tenant-1_prop-1')).toMatchObject({
			moveInMonth: '2026-02'
		});
	});

	it('Scenario: an invalid moveInMonth responds 400 and writes nothing', async () => {
		seedAdmin('admin-1');

		for (const moveInMonth of ['2026-13', '1026-08', '2000-01', '2026-8', 'August', 202608, null]) {
			const result = await call(assignTenant, {
				userID: 'admin-1',
				params: { propertyId: 'prop-1' },
				body: { tenantId: 'tenant-1', moveInMonth }
			});
			expect(result.status).toBe(400);
		}
		expect(db.peek('junction_user_property/tenant-1_prop-1')).toBeUndefined();
	});

	it('Scenario: Missing tenant responds 400 "Please provide a Tenant Id"', async () => {
		seedAdmin('admin-1');

		const result = await call(assignTenant, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			body: {}
		});

		expect(result).toMatchObject({ status: 400, error: 'Please provide a Tenant Id' });
		expect(db.peek('junction_user_property/undefined_prop-1')).toBeUndefined();
	});

	it('Scenario: a non-admin is rejected with 401 and nothing is written', async () => {
		seedTenant('tenant-1');

		const result = await call(assignTenant, {
			userID: 'tenant-1',
			params: { propertyId: 'prop-1' },
			body: { tenantId: 'tenant-1' }
		});

		expect(result).toMatchObject({ status: 401, error: 'You must be an admin to do this.' });
		expect(db.peek('junction_user_property/tenant-1_prop-1')).toBeUndefined();
	});

	it('Scenario: an anonymous caller is rejected with 401', async () => {
		const result = await call(assignTenant, {
			userID: null,
			params: { propertyId: 'prop-1' },
			body: { tenantId: 'tenant-1' }
		});

		expect(result.status).toBe(401);
	});
});

describe('tenant-assignment: remove tenant (DELETE /api/property/{id}/tenants)', () => {
	it('Scenario: Remove deletes only that junction document', async () => {
		seedAdmin('admin-1');
		linkTenant('tenant-1', 'prop-1');
		linkTenant('tenant-2', 'prop-1');

		const result = await call(removeTenant, {
			method: 'DELETE',
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			body: { tenantId: 'tenant-1' }
		});

		expect(result).toMatchObject({ status: 200, json: { status: 'Tenant removed' } });
		expect(db.peek('junction_user_property/tenant-1_prop-1')).toBeUndefined();
		expect(db.peek('junction_user_property/tenant-2_prop-1')).toBeDefined();
	});

	it('Scenario: Missing tenant responds 400', async () => {
		seedAdmin('admin-1');

		const result = await call(removeTenant, {
			method: 'DELETE',
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			body: {}
		});

		expect(result).toMatchObject({ status: 400, error: 'Please provide a Tenant Id' });
	});

	it('Scenario: a non-admin is rejected with 401 and the link stays', async () => {
		seedTenant('tenant-1');
		linkTenant('tenant-1', 'prop-1');

		const result = await call(removeTenant, {
			method: 'DELETE',
			userID: 'tenant-1',
			params: { propertyId: 'prop-1' },
			body: { tenantId: 'tenant-1' }
		});

		expect(result.status).toBe(401);
		expect(db.peek('junction_user_property/tenant-1_prop-1')).toBeDefined();
	});
});

describe("tenant-assignment: look up a user's property (GET /api/user/{id}/assoc)", () => {
	it('Scenario: Unassigned user responds { userProperty: undefined }', async () => {
		seedAdmin('admin-1');
		seedTenant('tenant-1');

		const result = await call(lookupProperty, {
			method: 'GET',
			userID: 'admin-1',
			params: { userId: 'tenant-1' }
		});

		expect(result.status).toBe(200);
		expect(result.json?.userProperty).toBeUndefined();
	});

	it('Scenario: Assigned user responds with the property id and data', async () => {
		seedAdmin('admin-1');
		seedTenant('tenant-1');
		seedProperty('prop-1', { title: 'Oak House' });
		linkTenant('tenant-1', 'prop-1');

		const result = await call(lookupProperty, {
			method: 'GET',
			userID: 'admin-1',
			params: { userId: 'tenant-1' }
		});

		expect(result.status).toBe(200);
		expect(result.json).toMatchObject({ id: 'prop-1', data: { title: 'Oak House' } });
	});

	it('Scenario: more than one link responds 500 with the count', async () => {
		seedAdmin('admin-1');
		linkTenant('tenant-1', 'prop-1');
		linkTenant('tenant-1', 'prop-2');

		const result = await call(lookupProperty, {
			method: 'GET',
			userID: 'admin-1',
			params: { userId: 'tenant-1' }
		});

		expect(result).toMatchObject({
			status: 500,
			error: 'User is associated with wrong number of properties: 2'
		});
	});

	it('Scenario: a non-admin is rejected with 401', async () => {
		seedTenant('tenant-1');

		const result = await call(lookupProperty, {
			method: 'GET',
			userID: 'tenant-1',
			params: { userId: 'tenant-1' }
		});

		expect(result.status).toBe(401);
	});
});

describe('tenant-assignment: assignable users (property edit page load)', () => {
	it('Scenario: Options lists current tenants and the add dropdown excludes them', async () => {
		seedAdmin('admin-1');
		seedTenant('tenant-1', { firstName: 'Tom', lastName: 'One' });
		seedTenant('tenant-2', { firstName: 'Tess', lastName: 'Two' });
		seedProperty('prop-1');
		linkTenant('tenant-1', 'prop-1');

		const result = await call(editLoad, { userID: 'admin-1', params: { propertyId: 'prop-1' } });

		expect(result.status).toBe(200);
		expect(result.data.tenants.map((t: { id: string }) => t.id)).toEqual(['tenant-1']);
		// Only tenants are checked: whether other roles appear in the list is not specified.
		const options = result.data.usersOptions as { label: string; value: string }[];
		expect(options.map((o) => o.value)).not.toContain('tenant-1');
		expect(options.find((o) => o.value === 'tenant-2')).toEqual({
			label: 'Tess Two',
			value: 'tenant-2'
		});
	});

	it('Scenario: with no tenants on the property, other tenants are offered', async () => {
		seedAdmin('admin-1');
		seedTenant('tenant-1');
		seedTenant('tenant-2');
		seedProperty('prop-1');

		const result = await call(editLoad, { userID: 'admin-1', params: { propertyId: 'prop-1' } });

		expect(result.data.tenants).toEqual([]);
		const values = (result.data.usersOptions as { value: string }[]).map((o) => o.value);
		expect(values).toEqual(expect.arrayContaining(['tenant-1', 'tenant-2']));
	});

	it('Scenario: Unknown property fails with 500 "Error retrieving property"', async () => {
		seedAdmin('admin-1');

		const result = await call(editLoad, { userID: 'admin-1', params: { propertyId: 'nope' } });

		expect(result).toMatchObject({ status: 500, error: 'Error retrieving property' });
	});

	it('Scenario: a non-admin is rejected with 401', async () => {
		seedTenant('tenant-1');
		seedProperty('prop-1');

		const result = await call(editLoad, { userID: 'tenant-1', params: { propertyId: 'prop-1' } });

		expect(result.status).toBe(401);
	});
});

describe('tenant-assignment: tenant id is validated', () => {
	it('Scenario: a tenant id containing a slash responds 400 for POST and PATCH', async () => {
		seedAdmin('admin-1');

		const post = await call(assignTenant, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			body: { tenantId: 'a/b' }
		});
		const patch = await call(updateTenant, {
			method: 'PATCH',
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			body: { tenantId: 'a/b', moveInMonth: '2026-01' }
		});

		expect([post.status, patch.status]).toEqual([400, 400]);
	});
});

describe('tenant-assignment: change move-in month (PATCH /api/property/{id}/tenants)', () => {
	it('Scenario: an admin updates the junction moveInMonth', async () => {
		seedAdmin('admin-1');
		seedProperty('prop-1');
		linkTenant('tenant-1', 'prop-1');

		const result = await call(updateTenant, {
			method: 'PATCH',
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			body: { tenantId: 'tenant-1', moveInMonth: '2026-05' }
		});

		expect(result.status).toBe(200);
		expect(db.peek('junction_user_property/tenant-1_prop-1')).toMatchObject({
			tenantId: 'tenant-1',
			moveInMonth: '2026-05'
		});
	});

	it('Scenario: an invalid month responds 400 and changes nothing', async () => {
		seedAdmin('admin-1');
		linkTenant('tenant-1', 'prop-1');

		for (const moveInMonth of [undefined, '2026-00', 'x']) {
			const result = await call(updateTenant, {
				method: 'PATCH',
				userID: 'admin-1',
				params: { propertyId: 'prop-1' },
				body: { tenantId: 'tenant-1', moveInMonth }
			});
			expect(result.status).toBe(400);
		}
		expect(db.peek('junction_user_property/tenant-1_prop-1')).not.toHaveProperty('moveInMonth');
	});

	it('Scenario: a tenant that is not assigned responds 404', async () => {
		seedAdmin('admin-1');

		const result = await call(updateTenant, {
			method: 'PATCH',
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			body: { tenantId: 'ghost', moveInMonth: '2026-05' }
		});

		expect(result.status).toBe(404);
		expect(db.peek('junction_user_property/ghost_prop-1')).toBeUndefined();
	});

	it('Scenario: a non-admin is rejected with 401', async () => {
		seedTenant('tenant-1');
		linkTenant('tenant-1', 'prop-1');

		const result = await call(updateTenant, {
			method: 'PATCH',
			userID: 'tenant-1',
			params: { propertyId: 'prop-1' },
			body: { tenantId: 'tenant-1', moveInMonth: '2026-05' }
		});

		expect(result.status).toBe(401);
		expect(db.peek('junction_user_property/tenant-1_prop-1')).not.toHaveProperty('moveInMonth');
	});
});
