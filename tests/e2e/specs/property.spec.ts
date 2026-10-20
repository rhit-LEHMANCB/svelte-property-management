import { expect, test } from '@playwright/test';
import { ADMIN, FIRESTORE_EMULATOR, PROJECT_ID } from '../support/constants';
import { adminAuth, adminDb, storageFileExists, uploadStorageFile } from '../support/admin';
import { signIn } from '../support/helpers';

const findProperty = async (title: string) => {
	const response = await fetch(
		`http://${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
		{
			method: 'POST',
			headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' },
			body: JSON.stringify({
				structuredQuery: {
					from: [{ collectionId: 'properties' }],
					where: {
						fieldFilter: {
							field: { fieldPath: 'title' },
							op: 'EQUAL',
							value: { stringValue: title }
						}
					}
				}
			})
		}
	);
	const rows = (await response.json()) as { document?: { fields: Record<string, any> } }[]; // eslint-disable-line @typescript-eslint/no-explicit-any
	return rows.find((row) => row.document)?.document?.fields;
};

test.describe('property-management', () => {
	test('Scenario: an admin creates a property and finds it in the list', async ({ page }) => {
		const title = `Birch Lane ${Date.now()}`;

		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		await page.getByRole('link', { name: 'Add Property' }).click();
		await expect(page).toHaveURL(/\/admin\/properties\/add$/);
		await page.waitForLoadState('networkidle');

		await page.getByTitle('Title', { exact: true }).fill(title);
		await page.getByTitle('Rent').fill('1450');
		await page.getByTitle('Description').fill('Bright two bedroom with a garden.');
		await page.getByTitle('Bedrooms').fill('2');
		await page.getByTitle('Bathrooms').fill('1.5');
		await page.getByTitle('Square Feet').fill('950');
		await page.getByTitle('Street Address').fill('12 Birch Lane');
		await page.getByTitle('City').fill('Terre Haute');
		await page.getByTitle('State').fill('IN');
		await page.getByTitle('Zip Code').fill('47803');
		await page.getByRole('button', { name: 'Save' }).click();

		// Valid property: created, and the browser lands on its edit page.
		await expect(page.getByText('Successfully created property')).toBeVisible();
		await expect(page).toHaveURL(/\/admin\/properties\/[^/]+\/edit$/);

		await expect.poll(async () => (await findProperty(title))?.rent?.integerValue).toBe('1450');
		const stored = await findProperty(title);
		expect(stored?.city?.stringValue).toBe('Terre Haute');
		expect(stored?.state?.stringValue).toBe('IN');
		expect(stored?.streetAddress?.stringValue).toBe('12 Birch Lane');
		expect(stored?.zip?.stringValue).toBe('47803');
		expect(stored?.bathrooms?.doubleValue).toBe(1.5);

		// Property directory: the new property is listed.
		await page.goto('/admin/properties');
		await expect(page.getByText(title)).toBeVisible();
	});

	test('Scenario: Invalid property (bad zip code) is not created', async ({ page }) => {
		const title = `Bad Zip ${Date.now()}`;

		await signIn(page, ADMIN);
		await page.goto('/admin/properties/add');
		await page.waitForLoadState('networkidle');
		await page.getByTitle('Title', { exact: true }).fill(title);
		await page.getByTitle('Rent').fill('1000');
		await page.getByTitle('Description').fill('x');
		await page.getByTitle('Bedrooms').fill('1');
		await page.getByTitle('Bathrooms').fill('1');
		await page.getByTitle('Square Feet').fill('500');
		await page.getByTitle('Street Address').fill('1 Test St');
		await page.getByTitle('City').fill('Terre Haute');
		await page.getByTitle('State').fill('IN');
		await page.getByTitle('Zip Code').fill('abc');
		await page.getByRole('button', { name: 'Save' }).click();

		// Wait for the app to react (the zip field is flagged invalid) before checking nothing was created.
		await expect(page.getByTitle('Zip Code')).toHaveAccessibleDescription(
			'Please enter a valid zip code'
		);
		await expect(page).toHaveURL(/\/admin\/properties\/add$/);
		await expect(page.getByText('Successfully created property')).toHaveCount(0);
		expect(await findProperty(title)).toBeUndefined();
	});

	test('Scenario: the property form has no address lookup and makes no Google Maps requests', async ({
		page
	}) => {
		await adminDb().doc('properties/e2e-manual-address').set({
			title: 'E2E Manual Address',
			description: 'Address typed by hand',
			bedrooms: 2,
			bathrooms: 1,
			squareFeet: 800,
			rent: 900,
			streetAddress: '5 Oak St',
			city: 'Terre Haute',
			state: 'IN',
			zip: '47803'
		});
		const mapsRequests: string[] = [];
		page.on('request', (request) => {
			if (new URL(request.url()).hostname === 'maps.googleapis.com')
				mapsRequests.push(request.url());
		});

		await signIn(page, ADMIN);
		for (const path of ['/admin/properties/add', '/admin/properties/e2e-manual-address/edit']) {
			await page.goto(path);
			await page.waitForLoadState('networkidle');
			await expect(page.getByTitle('Address Lookup')).toHaveCount(0);
			for (const field of ['Street Address', 'Apartment Info', 'City', 'State', 'Zip Code']) {
				await expect(page.getByTitle(field, { exact: true })).toBeVisible();
			}
			// Typing in the address fields must not start a lookup either.
			await page.getByTitle('Street Address').fill('7 Elm St');
			await page.waitForLoadState('networkidle');
		}
		expect(mapsRequests).toEqual([]);
	});

	test('Scenario: a property whose photos were all deleted still appears in the list', async ({
		page
	}) => {
		// Deleting the last photo leaves `photos: []`, which is not the same as no photos field.
		await adminDb().doc('properties/e2e-no-photos').set({
			title: '000 E2E Emptied Photos Court',
			description: 'All photos were deleted',
			streetAddress: '3 Main St',
			city: 'Terre Haute',
			state: 'IN',
			rent: 700,
			photos: []
		});

		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');

		// The title sorts first, so the row is on the first page of the directory.
		const row = page.getByRole('row').filter({ hasText: '000 E2E Emptied Photos Court' });
		await expect(row).toBeVisible();
		await expect(row.locator('img')).toHaveCount(0);
		await expect(row.locator('svg').first()).toBeVisible();
	});
});

test.describe('property-management: Cascade', () => {
	const PROPERTY_ID = 'e2e-cascade-property';
	const TITLE = 'E2E Cascade Court';
	const LEASE = 'e2e-cascade-lease';
	const DOCUMENT = `leases/${LEASE}/lease.pdf`;
	const RESIDENT = {
		uid: 'e2e-cascade-tenant',
		email: 'cascade@e2e.test',
		password: 'E2e-Cascade-Passw0rd'
	};

	test.beforeAll(async () => {
		const db = adminDb();
		await adminAuth()
			.deleteUser(RESIDENT.uid)
			.catch(() => undefined);
		await adminAuth().createUser({
			uid: RESIDENT.uid,
			email: RESIDENT.email,
			password: RESIDENT.password
		});
		await db.doc(`users/${RESIDENT.uid}`).set({
			email: RESIDENT.email,
			firstName: 'Cass',
			lastName: 'Cascade',
			phoneNumber: '+15555550180',
			permissions: 'user',
			stripeID: 'cus_cascade'
		});
		await db.doc(`properties/${PROPERTY_ID}`).set({
			title: TITLE,
			description: 'Deleted by the cascade test',
			streetAddress: '24 Cascade Way',
			city: 'Terre Haute',
			state: 'IN',
			rent: 900
		});
		await uploadStorageFile(DOCUMENT, Buffer.from('%PDF-1.4\n%%EOF\n'), 'application/pdf');
		await db.doc(`leases/${LEASE}`).set({
			propertyId: PROPERTY_ID,
			tenantIds: [RESIDENT.uid],
			rent: 900,
			startDate: '2026-01-01',
			endDate: null,
			document: {
				path: DOCUMENT,
				fileName: 'lease.pdf',
				size: 15,
				uploadedAt: '2026-01-01T00:00:00.000Z'
			},
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z'
		});
		await db.doc(`leases/${LEASE}/payment_history/2026`).set({ January: { remainingBalance: 0 } });
		await db.doc(`leases/${LEASE}/recorded_invoices/in_cascade`).set({ recordedAt: '2026-01-15' });
	});

	test('Scenario: a property with a paid lease is refused, and once the payment is gone the cascade removes the lease, its document and its records, and the tenant still loads the app', async ({
		page
	}) => {
		const db = adminDb();
		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		await page.getByRole('searchbox', { name: 'Search properties' }).fill(TITLE);
		const deleteProperty = async () => {
			await page.getByRole('button', { name: `Actions for ${TITLE}` }).click();
			await page.getByRole('menuitem', { name: 'Delete' }).click();
			await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
		};

		await deleteProperty();
		await expect(page.getByText(/This property has leases with recorded payments/)).toBeVisible();
		expect((await db.doc(`properties/${PROPERTY_ID}`).get()).exists).toBe(true);
		expect((await db.doc(`leases/${LEASE}`).get()).exists).toBe(true);
		expect((await db.doc(`leases/${LEASE}/payment_history/2026`).get()).exists).toBe(true);
		expect(await storageFileExists(DOCUMENT)).toBe(true);
		await expect(page.getByRole('button', { name: `Actions for ${TITLE}` })).toBeVisible();

		await db.doc(`leases/${LEASE}/payment_history/2026`).delete();
		await deleteProperty();
		await expect(page.getByText('Property Successfully Removed.')).toBeVisible();

		expect((await db.doc(`properties/${PROPERTY_ID}`).get()).exists).toBe(false);
		expect((await db.doc(`leases/${LEASE}`).get()).exists).toBe(false);
		expect((await db.doc(`leases/${LEASE}/payment_history/2026`).get()).exists).toBe(false);
		expect((await db.doc(`leases/${LEASE}/recorded_invoices/in_cascade`).get()).exists).toBe(false);
		expect(await storageFileExists(DOCUMENT)).toBe(false);

		await page.context().clearCookies();
		await signIn(page, RESIDENT);
		await page.waitForLoadState('networkidle');
		await expect(page.getByText('No property is assigned to your account yet.')).toBeVisible();
	});
});

test('Scenario: a failed property delete without a refusal shows the generic message', async ({
	page
}) => {
	await signIn(page, ADMIN);
	await page.goto('/admin/properties');
	await page.waitForLoadState('networkidle');
	await page.route('**/api/property/*', (route) =>
		route.fulfill({
			status: 500,
			contentType: 'application/json',
			body: '{"message":"internal detail"}'
		})
	);
	await page
		.getByRole('button', { name: /^Actions for / })
		.first()
		.click();
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();

	await expect(page.getByText('Error removing property.')).toBeVisible();
	await expect(page.getByText('internal detail')).toHaveCount(0);
});
