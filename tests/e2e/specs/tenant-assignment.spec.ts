import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from '../support/constants';
import { adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

// tenant-assignment: the remove-tenant control opens only its confirmation (#86), and the add-tenant
// row lines up.

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

test.describe('tenant-assignment: the add-tenant row lines up', () => {
	test('Scenario: the picker icon sits inside its field, and Add matches the fields', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await openTenants(page);
		const box = async (name: string, locator: ReturnType<Page['locator']>) => {
			const b = await locator.boundingBox();
			if (!b) throw new Error(`${name} is not visible`);
			return { top: b.y, bottom: b.y + b.height };
		};
		const field = await box('tenant field', page.getByRole('combobox', { name: 'Tenant' }));
		const icon = await box(
			'options button',
			page.getByRole('button', { name: 'Show tenant options' })
		);
		const month = await box('move-in month', page.getByLabel('Move-in month', { exact: true }));
		const add = await box('Add', page.getByRole('button', { name: 'Add', exact: true }));
		const tenantLabel = await box('tenant label', page.getByText('Tenant', { exact: true }));
		const monthLabel = await box('month label', page.getByText('Move-in month', { exact: true }));

		// The icon was shifted up by half its height and stuck out of the top of the field.
		expect(icon.top).toBeGreaterThanOrEqual(field.top);
		expect(icon.bottom).toBeLessThanOrEqual(field.bottom);
		expect(Math.abs(icon.top - field.top - (field.bottom - icon.bottom))).toBeLessThanOrEqual(1);
		// The Add button was shorter than the fields beside it, and the labels sat at different heights.
		for (const control of [month, add]) {
			expect(Math.abs(control.top - field.top)).toBeLessThanOrEqual(1);
			expect(Math.abs(control.bottom - field.bottom)).toBeLessThanOrEqual(1);
		}
		expect(Math.abs(monthLabel.top - tenantLabel.top)).toBeLessThanOrEqual(1);
	});
});
