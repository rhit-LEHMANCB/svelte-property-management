import { describe, expect, it } from 'vitest';
import { FakeTimestamp } from '../helpers/fakeFirestore';
import { POST as closeRequest } from '../../src/routes/api/request/[requestId]/close/+server';
import {
	actions as tenantActions,
	load as tenantLoad
} from '../../src/routes/(authenticated)/maintenance/+page.server';
import { load as adminLoad } from '../../src/routes/(authenticated)/admin/maintenance/+page.server';
import { call } from '../helpers/callHandler';
import { db, linkTenant, seedAdmin, seedProperty, seedTenant } from '../helpers/seed';

const at = (ms: number) => FakeTimestamp.fromMillis(ms);

function seedRequest(id: string, fields: Record<string, unknown>) {
	db.seed(`maintenance/${id}`, {
		subject: `Subject ${id}`,
		description: 'details',
		propertyId: 'prop-1',
		propertyAddress: '1 Main St, Terre Haute, IN',
		submitter: 'Tom Tenant',
		status: 'Open',
		dateAdded: at(1000),
		...fields
	});
}

describe('maintenance-requests: submit request (tenant page action)', () => {
	const setup = () => {
		seedTenant('tenant-1', { firstName: 'Tom', lastName: 'Tenant' });
		seedProperty('prop-1', { streetAddress: '1 Main St', city: 'Terre Haute', state: 'IN' });
		linkTenant('tenant-1', 'prop-1');
	};

	it('Scenario: Valid submission creates an Open request with property, address, submitter and a server date', async () => {
		setup();

		const result = await call(tenantActions.default, {
			userID: 'tenant-1',
			form: { subject: 'Leaky sink', description: 'Kitchen sink drips' }
		});

		expect(result.data.form.message).toBe('Form submitted');
		const created = db.peek('maintenance/auto-id-1');
		expect(created).toMatchObject({
			subject: 'Leaky sink',
			description: 'Kitchen sink drips',
			status: 'Open',
			propertyId: 'prop-1',
			propertyAddress: '1 Main St, Terre Haute, IN',
			submitter: 'Tom Tenant'
		});
		expect(created?.dateAdded).toBeInstanceOf(FakeTimestamp);
		expect(created).not.toHaveProperty('dateClosed');
	});

	it('Scenario: Invalid form (empty subject or over-long fields) creates nothing and returns "Invalid form"', async () => {
		setup();

		for (const form of [
			{ subject: '', description: 'x' },
			{ subject: 'a'.repeat(51), description: 'x' },
			{ subject: 's', description: '' }
		]) {
			const result = await call(tenantActions.default, { userID: 'tenant-1', form });
			expect(result.data.form.message).toBe('Invalid form');
		}
		expect(db.peek('maintenance/auto-id-1')).toBeUndefined();
	});

	it('Scenario: a tenant with no property cannot submit (500, wrong number of properties)', async () => {
		seedTenant('tenant-1');

		const result = await call(tenantActions.default, {
			userID: 'tenant-1',
			form: { subject: 'Leak', description: 'x' }
		});

		expect(result).toMatchObject({
			status: 500,
			error: 'User is associated with wrong number of properties: 0'
		});
		expect(db.peek('maintenance/auto-id-1')).toBeUndefined();
	});

	it('Scenario: an anonymous caller is rejected with 401', async () => {
		const result = await call(tenantActions.default, {
			userID: null,
			form: { subject: 'Leak', description: 'x' }
		});

		expect(result.status).toBe(401);
	});
});

describe('maintenance-requests: tenant request list (tenant page load)', () => {
	it('Scenario: View shows only requests for the tenant’s own property, 5 per status', async () => {
		seedTenant('tenant-1');
		seedProperty('prop-1');
		linkTenant('tenant-1', 'prop-1');
		for (let i = 1; i <= 7; i++) {
			seedRequest(`open-${i}`, { status: 'Open', dateAdded: at(i * 1000) });
			seedRequest(`closed-${i}`, {
				status: 'Closed',
				dateAdded: at(500),
				dateClosed: at(i * 1000),
				workDone: 'fixed'
			});
		}
		seedRequest('other-open', { propertyId: 'prop-2', status: 'Open', dateAdded: at(99_000) });

		const result = await call(tenantLoad, {
			userID: 'tenant-1',
			parent: { userProperty: { id: 'prop-1', data: {} } }
		});

		const open = result.data.openMaintenanceRequests;
		const closed = result.data.closedMaintenanceRequests;
		expect(open.map((r: { id: string }) => r.id)).toEqual([
			'open-7',
			'open-6',
			'open-5',
			'open-4',
			'open-3'
		]);
		expect(closed.map((r: { id: string }) => r.id)).toEqual([
			'closed-7',
			'closed-6',
			'closed-5',
			'closed-4',
			'closed-3'
		]);
		expect(open.every((r: { propertyId: string }) => r.propertyId === 'prop-1')).toBe(true);
		// Dates arrive as JavaScript Dates, not Firestore Timestamps.
		expect(open[0].dateAdded).toBeInstanceOf(Date);
		expect(closed[0].dateClosed).toBeInstanceOf(Date);
		expect(open[0].dateClosed).toBeUndefined();
	});

	it('Scenario: without a property in the layout data the page redirects to /', async () => {
		seedTenant('tenant-1');

		const result = await call(tenantLoad, { userID: 'tenant-1', parent: {} });

		expect(result).toMatchObject({ status: 303, redirect: '/' });
	});
});

describe('maintenance-requests: admin request list (admin page load)', () => {
	it('Scenario: View shows requests from all properties, 5 newest open and 5 latest closed', async () => {
		seedAdmin('admin-1');
		seedRequest('a', { propertyId: 'prop-1', status: 'Open', dateAdded: at(1000) });
		seedRequest('b', { propertyId: 'prop-2', status: 'Open', dateAdded: at(2000) });
		seedRequest('c', {
			propertyId: 'prop-3',
			status: 'Closed',
			dateClosed: at(3000),
			workDone: 'done'
		});

		const result = await call(adminLoad, { userID: 'admin-1' });

		expect(result.data.openMaintenanceRequests.map((r: { id: string }) => r.id)).toEqual([
			'b',
			'a'
		]);
		expect(result.data.closedMaintenanceRequests.map((r: { id: string }) => r.id)).toEqual(['c']);
	});

	it('Scenario: lists are limited to 5 per status', async () => {
		seedAdmin('admin-1');
		for (let i = 1; i <= 8; i++) seedRequest(`o${i}`, { dateAdded: at(i * 1000) });

		const result = await call(adminLoad, { userID: 'admin-1' });

		expect(result.data.openMaintenanceRequests).toHaveLength(5);
		expect(result.data.openMaintenanceRequests[0].id).toBe('o8');
	});

	it('Scenario: a non-admin is rejected with 401', async () => {
		seedTenant('tenant-1');

		expect((await call(adminLoad, { userID: 'tenant-1' })).status).toBe(401);
	});
});

describe('maintenance-requests: close request (POST /api/request/{id}/close)', () => {
	it('Scenario: Close sets status Closed, a server dateClosed and the workDone note', async () => {
		seedAdmin('admin-1');
		seedRequest('m1', { status: 'Open' });

		const result = await call(closeRequest, {
			userID: 'admin-1',
			params: { requestId: 'm1' },
			body: { workDone: 'Replaced the washer' }
		});

		expect(result).toMatchObject({ status: 200, json: { status: 'Request Closed' } });
		const closed = db.peek('maintenance/m1');
		expect(closed).toMatchObject({ status: 'Closed', workDone: 'Replaced the washer' });
		expect(closed?.dateClosed).toBeInstanceOf(FakeTimestamp);
		// The rest of the request is preserved.
		expect(closed).toMatchObject({ subject: 'Subject m1', propertyId: 'prop-1' });
	});

	it('Scenario: Missing note responds 400 "Please provide work done." and leaves the request open', async () => {
		seedAdmin('admin-1');
		seedRequest('m1', { status: 'Open' });

		const result = await call(closeRequest, {
			userID: 'admin-1',
			params: { requestId: 'm1' },
			body: { workDone: '' }
		});

		expect(result).toMatchObject({ status: 400, error: 'Please provide work done.' });
		expect(db.peek('maintenance/m1')?.status).toBe('Open');
	});

	it('Scenario: a non-admin is rejected with 401 and the request stays open', async () => {
		seedTenant('tenant-1');
		seedRequest('m1', { status: 'Open' });

		const result = await call(closeRequest, {
			userID: 'tenant-1',
			params: { requestId: 'm1' },
			body: { workDone: 'sneaky' }
		});

		expect(result.status).toBe(401);
		expect(db.peek('maintenance/m1')?.status).toBe('Open');
	});
});
