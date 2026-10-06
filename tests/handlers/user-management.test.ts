import { describe, expect, it } from 'vitest';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { POST as addUser } from '../../src/routes/api/user/add/+server';
import { DELETE as deleteUser } from '../../src/routes/api/user/[userId]/+server';
import { load as usersLoad } from '../../src/routes/(authenticated)/admin/users/+page.server';
import { call } from '../helpers/callHandler';
import { services } from '../helpers/services';
import { db, seedAdmin, seedTenant } from '../helpers/seed';

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
