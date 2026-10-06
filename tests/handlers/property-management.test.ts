import { describe, expect, it } from 'vitest';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { DELETE as deleteProperty } from '../../src/routes/api/property/[propertyId]/+server';
import {
	DELETE as deletePhoto,
	POST as reorderPhotos
} from '../../src/routes/api/property/[propertyId]/photos/+server';
import { actions as addActions } from '../../src/routes/(authenticated)/admin/properties/add/+page.server';
import {
	actions as editActions,
	load as editLoad
} from '../../src/routes/(authenticated)/admin/properties/[propertyId]/edit/+page.server';
import { load as listLoad } from '../../src/routes/(authenticated)/admin/properties/+page.server';
import { call } from '../helpers/callHandler';
import { services } from '../helpers/services';
import { db, seedAdmin, seedProperty, seedTenant } from '../helpers/seed';

const validForm = {
	title: 'Maple Court',
	description: 'Two bedroom apartment',
	bedrooms: '2',
	bathrooms: '1.5',
	squareFeet: '900',
	rent: '1200',
	streetAddress: '1 Main St',
	apartmentInfo: '',
	city: 'Terre Haute',
	state: 'IN',
	zip: '47803'
};

describe('property-management: create property (add page action)', () => {
	it('Scenario: Valid property creates a properties document and returns its id', async () => {
		seedAdmin('admin-1');

		const result = await call(addActions.basicInfo, { userID: 'admin-1', form: validForm });

		expect(result.status).toBe(200);
		expect(result.data.form.valid).toBe(true);
		expect(result.data.form.message).toBe('idauto-id-1');
		expect(db.peek('properties/auto-id-1')).toEqual({
			title: 'Maple Court',
			description: 'Two bedroom apartment',
			bedrooms: 2,
			bathrooms: 1.5,
			squareFeet: 900,
			rent: 1200,
			streetAddress: '1 Main St',
			apartmentInfo: '',
			city: 'Terre Haute',
			state: 'IN',
			zip: '47803'
		});
	});

	it('Scenario: an invalid form creates nothing and returns "Invalid form"', async () => {
		seedAdmin('admin-1');

		const result = await call(addActions.basicInfo, {
			userID: 'admin-1',
			form: { ...validForm, zip: 'abc', title: '' }
		});

		expect(result.data.form.valid).toBe(false);
		expect(result.data.form.message).toBe('Invalid form');
		expect(db.peek('properties/auto-id-1')).toBeUndefined();
	});

	it('Scenario: a non-admin is rejected with 401 and nothing is created', async () => {
		seedTenant('tenant-1');

		const result = await call(addActions.basicInfo, { userID: 'tenant-1', form: validForm });

		expect(result).toMatchObject({ status: 401, error: 'You must be an admin to do this.' });
		expect(db.peek('properties/auto-id-1')).toBeUndefined();
	});
});

describe('property-management: edit property (edit page action)', () => {
	it('Scenario: Update changes the document with the validated fields', async () => {
		seedAdmin('admin-1');
		seedProperty('prop-1', { photos: [{ id: 'a.png', photoUrl: 'u' }] });

		const result = await call(editActions.basicInfo, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			form: { ...validForm, title: 'Renamed', rent: '1300' }
		});

		expect(result.data.form.message).toBe('Form submitted');
		expect(db.peek('properties/prop-1')).toMatchObject({ title: 'Renamed', rent: 1300 });
		// Fields the form does not carry, such as photos, are left alone.
		expect(db.peek('properties/prop-1')?.photos).toEqual([{ id: 'a.png', photoUrl: 'u' }]);
	});

	it('Scenario: an invalid form leaves the property unchanged', async () => {
		seedAdmin('admin-1');
		seedProperty('prop-1');

		const result = await call(editActions.basicInfo, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			form: { ...validForm, state: 'INDIANA' }
		});

		expect(result.data.form.message).toBe('Invalid form');
		expect(db.peek('properties/prop-1')?.title).toBe('Maple Court');
	});

	it('Scenario: Unknown property fails the page load with 500 "Error retrieving property"', async () => {
		seedAdmin('admin-1');

		const result = await call(editLoad, { userID: 'admin-1', params: { propertyId: 'nope' } });

		expect(result).toMatchObject({ status: 500, error: 'Error retrieving property' });
	});
});

describe('property-management: property photos', () => {
	const png = (name: string, bytes = [1, 2, 3]) =>
		new File([new Uint8Array(bytes)], name, { type: 'image/png' });

	it('Scenario: Upload saves each file under properties/{id}/images/ and adds them to photos', async () => {
		seedAdmin('admin-1');
		seedProperty('prop-1');
		const form = new FormData();
		form.append('photos', png('front.png'));
		form.append('photos', png('back.jpg'));

		const result = await call(editActions.photos, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			form
		});

		expect(result.status).toBe(200);
		const written = services.storage.log.written.map((w) => w.path);
		expect(written).toHaveLength(2);
		expect(written[0]).toMatch(/^properties\/prop-1\/images\/0-\d+\.png$/);
		expect(written[1]).toMatch(/^properties\/prop-1\/images\/1-\d+\.jpg$/);
		const photos = db.peek('properties/prop-1')?.photos as { id: string; photoUrl: string }[];
		expect(photos).toHaveLength(2);
		expect(photos[0].photoUrl).toBe(
			`https://firebasestorage.googleapis.com/v0/b/${PUBLIC_FB_STORAGE_BUCKET}/o/properties%2Fprop-1%2Fimages%2F${photos[0].id}?alt=media`
		);
	});

	it('Scenario: an empty upload fails with 400 and stores nothing', async () => {
		seedAdmin('admin-1');
		seedProperty('prop-1');
		const form = new FormData();
		form.append('photos', new File([], 'empty.png'));

		const result = await call(editActions.photos, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			form
		});

		expect(result.status).toBe(400);
		expect(services.storage.log.written).toHaveLength(0);
	});

	it('Scenario: Reorder replaces the photos array with the supplied order', async () => {
		seedAdmin('admin-1');
		const a = { id: 'a.png', photoUrl: 'ua' };
		const b = { id: 'b.png', photoUrl: 'ub' };
		seedProperty('prop-1', { photos: [a, b] });

		const result = await call(reorderPhotos, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			body: { photos: [b, a] }
		});

		expect(result).toMatchObject({ status: 200, json: { status: 'Photos reordered' } });
		expect(db.peek('properties/prop-1')?.photos).toEqual([b, a]);
	});

	it('Scenario: Delete photo removes it from photos and from storage', async () => {
		seedAdmin('admin-1');
		const a = { id: 'a.png', photoUrl: 'ua' };
		const b = { id: 'b.png', photoUrl: 'ub' };
		seedProperty('prop-1', { photos: [a, b] });

		const result = await call(deletePhoto, {
			method: 'DELETE',
			userID: 'admin-1',
			params: { propertyId: 'prop-1' },
			body: { photo: a }
		});

		expect(result).toMatchObject({ status: 200, json: { status: 'Photo Deleted' } });
		expect(db.peek('properties/prop-1')?.photos).toEqual([b]);
		expect(services.storage.log.deleted).toEqual(['properties/prop-1/images/a.png']);
	});

	it('Scenario: a non-admin cannot reorder or delete photos', async () => {
		seedTenant('tenant-1');
		seedProperty('prop-1', { photos: [{ id: 'a.png', photoUrl: 'ua' }] });

		const reorder = await call(reorderPhotos, {
			userID: 'tenant-1',
			params: { propertyId: 'prop-1' },
			body: { photos: [] }
		});
		const remove = await call(deletePhoto, {
			method: 'DELETE',
			userID: 'tenant-1',
			params: { propertyId: 'prop-1' },
			body: { photo: { id: 'a.png', photoUrl: 'ua' } }
		});

		expect(reorder.status).toBe(401);
		expect(remove.status).toBe(401);
		expect(db.peek('properties/prop-1')?.photos).toHaveLength(1);
		expect(services.storage.log.deleted).toHaveLength(0);
	});
});

describe('property-management: delete property (DELETE /api/property/{id})', () => {
	it('Scenario: Cascade removes the property, its maintenance requests and its storage files', async () => {
		seedAdmin('admin-1');
		seedProperty('prop-1');
		seedProperty('prop-2');
		db.seed('maintenance/m1', { propertyId: 'prop-1', status: 'Open' });
		db.seed('maintenance/m2', { propertyId: 'prop-1', status: 'Closed' });
		db.seed('maintenance/m3', { propertyId: 'prop-2', status: 'Open' });

		const result = await call(deleteProperty, {
			method: 'DELETE',
			userID: 'admin-1',
			params: { propertyId: 'prop-1' }
		});

		expect(result).toMatchObject({ status: 200, json: { status: 'Property Deleted' } });
		expect(db.peek('properties/prop-1')).toBeUndefined();
		expect(db.peek('maintenance/m1')).toBeUndefined();
		expect(db.peek('maintenance/m2')).toBeUndefined();
		expect(services.storage.log.deletedPrefixes).toEqual(['properties/prop-1/']);
		// Other properties and their requests are untouched.
		expect(db.peek('properties/prop-2')).toBeDefined();
		expect(db.peek('maintenance/m3')).toBeDefined();
	});

	it('Scenario: a non-admin is rejected with 401 and nothing is deleted', async () => {
		seedTenant('tenant-1');
		seedProperty('prop-1');

		const result = await call(deleteProperty, {
			method: 'DELETE',
			userID: 'tenant-1',
			params: { propertyId: 'prop-1' }
		});

		expect(result.status).toBe(401);
		expect(db.peek('properties/prop-1')).toBeDefined();
	});
});

describe('property-management: property directory (admin properties page load)', () => {
	it('Scenario: List shows all properties ordered by title', async () => {
		seedAdmin('admin-1');
		seedProperty('p-c', { title: 'Cedar' });
		seedProperty('p-a', { title: 'Aspen' });
		seedProperty('p-b', { title: 'Birch' });

		const result = await call(listLoad, { userID: 'admin-1' });

		expect(result.data.properties.map((p: { id: string }) => p.id)).toEqual(['p-a', 'p-b', 'p-c']);
		expect(result.data.properties[0].data.title).toBe('Aspen');
	});

	it('Scenario: a non-admin is rejected with 401', async () => {
		seedTenant('tenant-1');

		expect((await call(listLoad, { userID: 'tenant-1' })).status).toBe(401);
	});
});
