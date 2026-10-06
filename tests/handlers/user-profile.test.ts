import { describe, expect, it } from 'vitest';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { actions, load } from '../../src/routes/(authenticated)/profile/+page.server';
import { call } from '../helpers/callHandler';
import { services } from '../helpers/services';
import { db, seedTenant } from '../helpers/seed';

const profileForm = {
	firstName: 'Tess',
	lastName: 'Renter',
	email: 'tess@example.com',
	phoneNumber: '+15555550123'
};

describe('user-profile: edit contact information (profile contact action)', () => {
	it('Scenario: Valid update changes Firestore, the Stripe customer and the Auth email', async () => {
		seedTenant('t1', { stripeID: 'cus_t1', firstName: 'Tom', lastName: 'Tenant' });

		const result = await call(actions.contact, { userID: 't1', form: profileForm });

		expect(result.data.form.message).toBe('Form submitted');
		expect(db.peek('users/t1')).toMatchObject({ ...profileForm, permissions: 'user' });
		expect(services.stripe.customers.update).toHaveBeenCalledWith('cus_t1', {
			name: 'Tess Renter',
			email: 'tess@example.com',
			phone: '+15555550123'
		});
		expect(services.auth.updateUser).toHaveBeenCalledWith('t1', { email: 'tess@example.com' });
	});

	it('Scenario: a user without a Stripe customer skips the Stripe update but still updates Auth', async () => {
		seedTenant('t1', { stripeID: undefined });

		const result = await call(actions.contact, { userID: 't1', form: profileForm });

		expect(result.data.form.message).toBe('Form submitted');
		expect(services.stripe.customers.update).not.toHaveBeenCalled();
		expect(services.auth.updateUser).toHaveBeenCalledOnce();
	});

	it('Scenario: Invalid form writes nothing and returns "Invalid form"', async () => {
		seedTenant('t1', { firstName: 'Tom' });

		for (const bad of [
			{ ...profileForm, firstName: '' },
			{ ...profileForm, email: 'nope' },
			{ ...profileForm, phoneNumber: '12' }
		]) {
			const result = await call(actions.contact, { userID: 't1', form: bad });
			expect(result.data.form.message).toBe('Invalid form');
		}
		expect(db.peek('users/t1')?.firstName).toBe('Tom');
		expect(services.stripe.customers.update).not.toHaveBeenCalled();
		expect(services.auth.updateUser).not.toHaveBeenCalled();
	});

	it('Scenario: an anonymous caller is rejected with 401', async () => {
		const result = await call(actions.contact, { userID: null, form: profileForm });

		expect(result.status).toBe(401);
	});

	it('Scenario: the page load prefills the form with the stored contact details', async () => {
		seedTenant('t1', { firstName: 'Tom', lastName: 'Tenant', email: 't1@example.com' });

		const result = await call(load, { userID: 't1' });

		expect(result.data.form.data).toMatchObject({
			firstName: 'Tom',
			lastName: 'Tenant',
			email: 't1@example.com'
		});
	});
});

describe('user-profile: profile photo (profile photo action)', () => {
	const photoForm = (file: File) => {
		const form = new FormData();
		form.append('photo', file);
		return form;
	};

	it('Scenario: Upload replaces earlier files and records the new photoUrl', async () => {
		seedTenant('t1');

		const result = await call(actions.photo, {
			userID: 't1',
			form: photoForm(new File([new Uint8Array([1, 2, 3])], 'me.png', { type: 'image/png' }))
		});

		expect(result.status).toBe(200);
		// Existing files under users/{uid}/profile are removed first.
		expect(services.storage.log.deletedPrefixes).toEqual(['users/t1/profile']);
		expect(services.storage.bucket).toHaveBeenCalledWith(`gs://${PUBLIC_FB_STORAGE_BUCKET}`);
		expect(services.storage.log.written).toHaveLength(1);
		const [{ path }] = services.storage.log.written;
		expect(path).toMatch(/^users\/t1\/profile\/\d+\.png$/);
		const fileName = path.split('/').pop();
		expect(db.peek('users/t1')?.photoUrl).toBe(
			`https://firebasestorage.googleapis.com/v0/b/${PUBLIC_FB_STORAGE_BUCKET}/o/users%2Ft1%2Fprofile%2F${fileName}?alt=media`
		);
	});

	it('Scenario: Empty file fails with 400 and changes nothing', async () => {
		seedTenant('t1', { photoUrl: 'https://old.example/photo.png' });

		const result = await call(actions.photo, {
			userID: 't1',
			form: photoForm(new File([], 'x.png'))
		});

		expect(result.status).toBe(400);
		expect(services.storage.log.deletedPrefixes).toHaveLength(0);
		expect(services.storage.log.written).toHaveLength(0);
		expect(db.peek('users/t1')?.photoUrl).toBe('https://old.example/photo.png');
	});

	it('Scenario: an anonymous caller is rejected with 401', async () => {
		const result = await call(actions.photo, {
			userID: null,
			form: photoForm(new File([new Uint8Array([1])], 'x.png'))
		});

		expect(result.status).toBe(401);
	});
});
