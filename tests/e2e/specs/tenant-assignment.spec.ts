import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from '../support/constants';
import { adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

// tenant-assignment: the remove-tenant control opens only its confirmation (#86).

const PROPERTY_ID = 'e2e-remove-tenant-property';
const TENANT = { id: 'e2e-rita', firstName: 'Rita', lastName: 'Remove', email: 'rita@e2e.test' };
const NAME = `${TENANT.firstName} ${TENANT.lastName}`;

test.beforeEach(async () => {
	const db = adminDb();
	await db.doc(`properties/${PROPERTY_ID}`).set({
		title: 'E2E Remove Tenant Court',
		description: 'Remove tenant test property',
		bedrooms: 1,
		bathrooms: 1,
		squareFeet: 500,
		rent: 800,
		streetAddress: '6 Main St',
		apartmentInfo: '',
		city: 'Terre Haute',
		state: 'IN',
		zip: '47802'
	});
	await db.doc(`users/${TENANT.id}`).set({
		email: TENANT.email,
		firstName: TENANT.firstName,
		lastName: TENANT.lastName,
		phoneNumber: '+15555550160',
		permissions: 'user'
	});
	await db
		.doc(`junction_user_property/${TENANT.id}_${PROPERTY_ID}`)
		.set({ tenantId: TENANT.id, propertyId: PROPERTY_ID, moveInMonth: '2026-01' });
});

async function openTenants(page: Page) {
	await page.route('**/maps.googleapis.com/**', (route) => route.abort());
	await signIn(page, ADMIN);
	await page.goto(`/admin/properties/${PROPERTY_ID}/edit`);
	await page.waitForLoadState('networkidle');
	await page.getByRole('tab', { name: 'Tenants' }).click();
	return page.getByRole('table', { name: 'tenants' }).getByRole('row').filter({ hasText: NAME });
}

test.describe('tenant-assignment: remove-tenant control opens only its confirmation', () => {
	test('Scenario: Cancel removal', async ({ page }) => {
		const row = await openTenants(page);
		await row.getByRole('button', { name: `Remove ${NAME} from this property` }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toHaveCount(1);
		await expect(dialog).toHaveAccessibleName('Please Confirm');
		await dialog.getByRole('button', { name: 'Cancel' }).click();

		await expect(page.getByRole('dialog')).toHaveCount(0);
		// Nothing queued behind the confirmation opens afterwards.
		await page.waitForTimeout(500);
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(row).toBeVisible();
	});

	test('Scenario: Confirm removal', async ({ page }) => {
		const row = await openTenants(page);
		await row.getByRole('button', { name: `Remove ${NAME} from this property` }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();

		await expect(page.getByText('User successfully removed from property.')).toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await page.waitForTimeout(500);
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(
			page.getByRole('table', { name: 'tenants' }).getByRole('row').filter({ hasText: NAME })
		).toHaveCount(0);
		const junction = await adminDb()
			.doc(`junction_user_property/${TENANT.id}_${PROPERTY_ID}`)
			.get();
		expect(junction.exists).toBe(false);
	});

	test('Scenario: Open the row', async ({ page }) => {
		const row = await openTenants(page);
		await row.getByRole('button', { name: new RegExp(`^${NAME}`) }).click();

		await expect(page.getByRole('dialog')).toHaveAccessibleName(NAME);
	});

	test('Scenario: No nested interactive controls', async ({ page }) => {
		const row = await openTenants(page);
		const nested = await row.evaluate(
			(tr) => tr.querySelectorAll('button button, button input, a button, button a').length
		);

		expect(nested).toBe(0);
	});
});
