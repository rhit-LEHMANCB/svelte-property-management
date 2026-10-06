import { beforeEach, describe, expect, it, vi } from 'vitest';

const userDocs = new Map<string, Record<string, unknown> | undefined>();

vi.mock('#lib/server/admin', () => ({
	adminDB: {
		collection: (name: string) => ({
			doc: (id: string) => ({
				get: async () => ({ data: () => (name === 'users' ? userDocs.get(id) : undefined) })
			})
		})
	}
}));

import {
	getAdminUserDataOrError,
	getUserDataOrError,
	getUserIdOrError
} from '#lib/server/authHelpers';

// SvelteKit's `error()` throws an HttpError carrying `status` and `body.message`.
const thrown = async (promiseOrFn: Promise<unknown> | (() => unknown)) => {
	try {
		await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
	} catch (e) {
		return e as { status: number; body: { message: string } };
	}
	return undefined;
};

beforeEach(() => {
	userDocs.clear();
	userDocs.set('admin-1', { permissions: 'admin', firstName: 'Ada' });
	userDocs.set('tenant-1', { permissions: 'user', firstName: 'Tom' });
	userDocs.set('no-perms', { firstName: 'Nobody' });
});

describe('access-control: admin-only operations (getUserIdOrError)', () => {
	it('Scenario: Anonymous caller gets 401 "You must be logged in to do this."', async () => {
		const e = await thrown(() => getUserIdOrError(null));
		expect(e?.status).toBe(401);
		expect(e?.body.message).toBe('You must be logged in to do this.');
	});

	it('Scenario: a signed-in caller passes through with their id', () => {
		expect(getUserIdOrError('tenant-1')).toBe('tenant-1');
	});
});

describe('access-control: admin-only operations (getAdminUserDataOrError)', () => {
	it('Scenario: Non-admin calls admin endpoint gets 401 "You must be an admin to do this."', async () => {
		const e = await thrown(getAdminUserDataOrError('tenant-1'));
		expect(e?.status).toBe(401);
		expect(e?.body.message).toBe('You must be an admin to do this.');
	});

	it('Scenario: a user document with no permissions field is not an admin', async () => {
		expect((await thrown(getAdminUserDataOrError('no-perms')))?.status).toBe(401);
	});

	it('Scenario: a missing user document is not an admin', async () => {
		expect((await thrown(getAdminUserDataOrError('ghost')))?.status).toBe(401);
	});

	it('Scenario: an admin gets their user data back', async () => {
		await expect(getAdminUserDataOrError('admin-1')).resolves.toMatchObject({
			permissions: 'admin',
			firstName: 'Ada'
		});
	});
});

describe('access-control: user data lookup (getUserDataOrError)', () => {
	it('Scenario: a missing user document fails with 401 "Failed to retrieve user details"', async () => {
		const e = await thrown(getUserDataOrError('ghost'));
		expect(e?.status).toBe(401);
		expect(e?.body.message).toBe('Failed to retrieve user details');
	});

	it('Scenario: an existing user, admin or tenant, is returned', async () => {
		await expect(getUserDataOrError('tenant-1')).resolves.toMatchObject({ permissions: 'user' });
		await expect(getUserDataOrError('admin-1')).resolves.toMatchObject({ permissions: 'admin' });
	});
});
