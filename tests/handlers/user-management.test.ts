import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { POST as addUser } from '../../src/routes/api/user/add/+server';
import { DELETE as deleteUser } from '../../src/routes/api/user/[userId]/+server';
import { load as usersLoad } from '../../src/routes/(authenticated)/admin/users/+page.server';
import { call } from '../helpers/callHandler';
import { services } from '../helpers/services';
import { db, linkTenant, seedAdmin, seedProperty, seedTenant } from '../helpers/seed';

describe('user-management: create user (POST /api/user/add)', () => {
	it('Scenario: New user creates the Auth user, Stripe customer, user document and welcome email', async () => {
		seedAdmin('admin-1');

		const result = await call(addUser, { userID: 'admin-1', body: { email: 'new@example.com' } });

		expect(result).toMatchObject({ status: 200, json: { status: 'New User Created' } });
		expect(services.auth.createUser).toHaveBeenCalledWith({ email: 'new@example.com' });
		expect(services.stripe.customers.create).toHaveBeenCalledWith({
			name: 'New User',
			email: 'new@example.com'
		});
		expect(db.peek('users/new-user-uid')).toEqual({
			email: 'new@example.com',
			firstName: 'New',
			lastName: 'User',
			phoneNumber: '',
			permissions: 'user',
			stripeID: 'cus_new'
		});
		expect(services.sendPasswordResetEmail).toHaveBeenCalledWith('new@example.com', true);
	});

	it('Scenario: Auth creation fails responds 500 and creates nothing else', async () => {
		seedAdmin('admin-1');
		services.auth.createUser.mockRejectedValue(new Error('email-already-exists'));

		const result = await call(addUser, { userID: 'admin-1', body: { email: 'dup@example.com' } });

		expect(result.status).toBe(500);
		expect(services.stripe.customers.create).not.toHaveBeenCalled();
		expect(services.sendPasswordResetEmail).not.toHaveBeenCalled();
		expect(db.peek('users/new-user-uid')).toBeUndefined();
	});

	it('Scenario: the Stripe call fails removes the Auth user and responds 500', async () => {
		seedAdmin('admin-1');
		services.stripe.customers.create.mockRejectedValue(new Error('stripe down'));

		const result = await call(addUser, { userID: 'admin-1', body: { email: 'new@example.com' } });

		expect(result.status).toBe(500);
		expect(services.auth.deleteUser).toHaveBeenCalledWith('new-user-uid');
		expect(db.peek('users/new-user-uid')).toBeUndefined();
		expect(services.sendPasswordResetEmail).not.toHaveBeenCalled();
	});

	it('Scenario: the Firestore write fails removes the Stripe customer and the Auth user', async () => {
		seedAdmin('admin-1');
		const realDoc = db.doc.bind(db);
		vi.spyOn(db, 'doc').mockImplementation((path: string) => {
			const ref = realDoc(path);
			if (path === 'users/new-user-uid')
				ref.set = async () => Promise.reject(new Error('write failed'));
			return ref;
		});

		const result = await call(addUser, { userID: 'admin-1', body: { email: 'new@example.com' } });

		vi.restoreAllMocks();
		expect(result.status).toBe(500);
		expect(services.stripe.customers.del).toHaveBeenCalledWith('cus_new');
		expect(services.auth.deleteUser).toHaveBeenCalledWith('new-user-uid');
		expect(services.sendPasswordResetEmail).not.toHaveBeenCalled();
	});

	it('Scenario: the welcome email fails removes the user document, Stripe customer and Auth user', async () => {
		seedAdmin('admin-1');
		services.sendPasswordResetEmail.mockRejectedValue(new Error('sendgrid refused'));

		const result = await call(addUser, { userID: 'admin-1', body: { email: 'new@example.com' } });

		expect(result.status).toBe(500);
		expect(db.peek('users/new-user-uid')).toBeUndefined();
		expect(services.stripe.customers.del).toHaveBeenCalledWith('cus_new');
		expect(services.auth.deleteUser).toHaveBeenCalledWith('new-user-uid');
	});

	it('Scenario: a rollback step that fails does not stop the others', async () => {
		seedAdmin('admin-1');
		services.sendPasswordResetEmail.mockRejectedValue(new Error('sendgrid refused'));
		services.stripe.customers.del.mockRejectedValue(new Error('stripe down'));

		const result = await call(addUser, { userID: 'admin-1', body: { email: 'new@example.com' } });

		expect(result.status).toBe(500);
		expect(db.peek('users/new-user-uid')).toBeUndefined();
		expect(services.auth.deleteUser).toHaveBeenCalledWith('new-user-uid');
	});

	it('Scenario: a non-admin is rejected with 401 and nothing is created', async () => {
		seedTenant('tenant-1');

		const result = await call(addUser, { userID: 'tenant-1', body: { email: 'new@example.com' } });

		expect(result).toMatchObject({ status: 401, error: 'You must be an admin to do this.' });
		expect(services.auth.createUser).not.toHaveBeenCalled();
	});

	it('Scenario: an anonymous caller is rejected with 401', async () => {
		const result = await call(addUser, { userID: null, body: { email: 'new@example.com' } });

		expect(result).toMatchObject({ status: 401, error: 'You must be logged in to do this.' });
		expect(services.auth.createUser).not.toHaveBeenCalled();
	});
});

describe('user-management: delete user (DELETE /api/user/{userId})', () => {
	it('Scenario: Delete removes the Auth account, the user document and the files under users/{userId}/', async () => {
		seedAdmin('admin-1');
		seedTenant('tenant-9');

		const result = await call(deleteUser, {
			method: 'DELETE',
			userID: 'admin-1',
			params: { userId: 'tenant-9' }
		});

		expect(result).toMatchObject({ status: 200, json: { status: 'User successfully deleted.' } });
		expect(services.auth.deleteUser).toHaveBeenCalledWith('tenant-9');
		expect(db.peek('users/tenant-9')).toBeUndefined();
		expect(services.storage.bucket).toHaveBeenCalledWith(`gs://${PUBLIC_FB_STORAGE_BUCKET}`);
		expect(services.storage.log.deletedPrefixes).toEqual(['users/tenant-9/']);
	});

	it('Scenario: Delete also removes the Stripe customer and the tenant links but keeps history', async () => {
		seedAdmin('admin-1');
		seedTenant('tenant-9');
		seedProperty('prop-1');
		linkTenant('tenant-9', 'prop-1');
		db.seed('maintenance/m1', { propertyId: 'prop-1', userId: 'tenant-9', status: 'Open' });
		db.seed('properties/prop-1/payment_history/2026', { August: { remainingBalance: 0 } });

		const result = await call(deleteUser, {
			method: 'DELETE',
			userID: 'admin-1',
			params: { userId: 'tenant-9' }
		});

		expect(result.status).toBe(200);
		expect(services.stripe.customers.del).toHaveBeenCalledWith('cus_tenant-9');
		expect(db.peek('junction_user_property/tenant-9_prop-1')).toBeUndefined();
		expect(db.peek('maintenance/m1')).toBeDefined();
		expect(db.peek('properties/prop-1/payment_history/2026')).toBeDefined();
	});

	it('Scenario: Already gone Stripe customer and Auth account still complete the delete', async () => {
		seedAdmin('admin-1');
		seedTenant('tenant-9');
		services.stripe.customers.del.mockRejectedValue(
			Object.assign(new Error('No such customer'), { code: 'resource_missing' })
		);
		services.auth.deleteUser.mockRejectedValue(
			Object.assign(new Error('no user'), { code: 'auth/user-not-found' })
		);

		const result = await call(deleteUser, {
			method: 'DELETE',
			userID: 'admin-1',
			params: { userId: 'tenant-9' }
		});

		expect(result.status).toBe(200);
		expect(db.peek('users/tenant-9')).toBeUndefined();
	});

	it('Scenario: Delete self responds 400 and removes nothing', async () => {
		seedAdmin('admin-1', { stripeID: 'cus_admin' });

		const result = await call(deleteUser, {
			method: 'DELETE',
			userID: 'admin-1',
			params: { userId: 'admin-1' }
		});

		expect(result.status).toBe(400);
		expect(db.peek('users/admin-1')).toBeDefined();
		expect(services.auth.deleteUser).not.toHaveBeenCalled();
		expect(services.stripe.customers.del).not.toHaveBeenCalled();
	});

	it('Scenario: a Stripe failure responds 500, keeps the user, and can be repeated', async () => {
		seedAdmin('admin-1');
		seedTenant('tenant-9');
		services.stripe.customers.del.mockRejectedValueOnce(new Error('stripe down'));

		const failed = await call(deleteUser, {
			method: 'DELETE',
			userID: 'admin-1',
			params: { userId: 'tenant-9' }
		});
		expect(failed.status).toBe(500);
		expect(db.peek('users/tenant-9')).toBeDefined();

		const retried = await call(deleteUser, {
			method: 'DELETE',
			userID: 'admin-1',
			params: { userId: 'tenant-9' }
		});
		expect(retried.status).toBe(200);
	});

	it('Scenario: a non-admin is rejected with 401 and nothing is deleted', async () => {
		seedTenant('tenant-1');
		seedTenant('tenant-9');

		const result = await call(deleteUser, {
			method: 'DELETE',
			userID: 'tenant-1',
			params: { userId: 'tenant-9' }
		});

		expect(result).toMatchObject({ status: 401, error: 'You must be an admin to do this.' });
		expect(services.auth.deleteUser).not.toHaveBeenCalled();
		expect(db.peek('users/tenant-9')).toBeDefined();
	});

	it('Scenario: an anonymous caller is rejected with 401', async () => {
		const result = await call(deleteUser, {
			method: 'DELETE',
			userID: null,
			params: { userId: 'tenant-9' }
		});

		expect(result.status).toBe(401);
	});
});

describe('user-management: user directory (admin users page load)', () => {
	it('Scenario: Admin lists users ordered by lastName', async () => {
		seedAdmin('admin-1', { lastName: 'Mills' });
		seedTenant('t-zed', { lastName: 'Zed' });
		seedTenant('t-abe', { lastName: 'Abe' });

		const result = await call(usersLoad, { userID: 'admin-1' });

		expect(result.status).toBe(200);
		expect(result.data.users.map((u: { id: string }) => u.id)).toEqual([
			't-abe',
			'admin-1',
			't-zed'
		]);
		expect(result.data.users[0].data).toMatchObject({ lastName: 'Abe', permissions: 'user' });
	});

	it('Scenario: a non-admin is rejected with 401', async () => {
		seedTenant('tenant-1');

		const result = await call(usersLoad, { userID: 'tenant-1' });

		expect(result).toMatchObject({ status: 401, error: 'You must be an admin to do this.' });
	});
});
