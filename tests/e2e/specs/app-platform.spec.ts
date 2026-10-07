import { expect, test } from '@playwright/test';
import { ADMIN, TENANT } from '../support/constants';
import { adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

// app-platform: the UI building blocks (dialogs, notifications, menus, autocompletes, tabs,
// pagination, navigation shell) keep working across framework and dependency upgrades.

const AC_PROPERTY = 'e2e-autocomplete-property';
const AC_TENANT = { id: 'e2e-ava', firstName: 'Ava', lastName: 'Autocomplete' };

test.describe('app-platform: modal dialogs keep working', () => {
	test('Scenario: Admin cancels a dialog', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		const rows = page.locator('ul.list > a');
		const before = await rows.count();
		expect(before).toBeGreaterThan(0);

		await rows.first().getByRole('button').click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toContainText('Are you sure you wish to delete');
		await dialog.getByRole('button', { name: 'Cancel' }).click();

		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(rows).toHaveCount(before);
	});

	test('Scenario: Escape dismisses a dialog without confirming', async ({ page }) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Make a Payment' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		await page.keyboard.press('Escape');

		await expect(page.getByRole('dialog')).toHaveCount(0);
	});
});

test.describe('app-platform: dialog input', () => {
	test('Scenario: a payment amount of 0 is rejected with a message, not ignored', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Make a Payment' }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('spinbutton').fill('0');
		await dialog.getByRole('button', { name: 'Submit' }).click();

		await expect(page.getByText('Number must be greater than 0')).toBeVisible();
	});
});

test.describe('app-platform: notifications keep working', () => {
	test('Scenario: a notification can be dismissed', async ({ page }) => {
		await page.route('**/api/signin/reset', (route) => route.fulfill({ status: 500, body: '{}' }));
		await signIn(page, TENANT);
		await page.goto('/profile');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Reset', exact: true }).click();
		const toast = page.getByRole('alert').filter({ hasText: 'Error sending reset email.' });
		await expect(toast).toBeVisible();

		await toast.getByRole('button', { name: 'Dismiss' }).click();

		await expect(toast).toHaveCount(0);
	});
});

test.describe('app-platform: menus, autocompletes, tabs and pagination keep working', () => {
	test.beforeAll(async () => {
		const db = adminDb();
		await db.doc(`properties/${AC_PROPERTY}`).set({
			title: 'E2E Autocomplete Court',
			description: 'Autocomplete test property',
			bedrooms: 1,
			bathrooms: 1,
			squareFeet: 500,
			rent: 800,
			streetAddress: '2 Main St',
			apartmentInfo: '',
			city: 'Terre Haute',
			state: 'IN',
			zip: '47802'
		});
		await db.doc(`users/${AC_TENANT.id}`).set({
			email: 'ava@e2e.test',
			firstName: AC_TENANT.firstName,
			lastName: AC_TENANT.lastName,
			phoneNumber: '+15555550142',
			permissions: 'user'
		});
	});

	test('Scenario: Autocomplete selection adds the chosen tenant', async ({ page }) => {
		await page.route('**/maps.googleapis.com/**', (route) => route.abort());
		await signIn(page, ADMIN);
		await page.goto(`/admin/properties/${AC_PROPERTY}/edit`);
		await page.waitForLoadState('networkidle');
		await page.getByText('Tenants', { exact: true }).click();

		const search = page.getByPlaceholder('Search...');
		await search.fill('Ava');
		await page.getByRole('button', { name: 'Ava Autocomplete' }).click();
		await expect(search).toHaveValue('Ava Autocomplete');
		await page.getByLabel('Move-in month', { exact: true }).fill('2026-05');
		await page.getByRole('button', { name: 'Add', exact: true }).click();

		await expect(page.getByText('Successfully added tenant.')).toBeVisible();
		await expect(page.getByText('ava@e2e.test')).toBeVisible();

		// The month was stored and can be changed from the list.
		const tenantMonth = page.getByLabel('Move-in month for Ava Autocomplete');
		await expect(tenantMonth).toHaveValue('2026-05');
		await tenantMonth.fill('2026-07');
		await expect(page.getByText('Move-in month updated.')).toBeVisible();
		await page.reload();
		await page.waitForLoadState('networkidle');
		await page.getByText('Tenants', { exact: true }).click();
		await expect(page.getByLabel('Move-in month for Ava Autocomplete')).toHaveValue('2026-07');
	});

	test('Scenario: Tabs show one panel at a time', async ({ page }) => {
		await page.route('**/maps.googleapis.com/**', (route) => route.abort());
		await signIn(page, ADMIN);
		await page.goto(`/admin/properties/${AC_PROPERTY}/edit`);
		await page.waitForLoadState('networkidle');
		await expect(page.getByLabel('Title')).toBeVisible();

		await page.getByText('Photos', { exact: true }).click();

		await expect(
			page.getByRole('heading', { name: 'Photos' }).or(page.getByText('Photos').nth(1))
		).toBeVisible();
		await expect(page.locator('input[type="file"][name="photos"]')).toBeVisible();
		await expect(page.getByLabel('Title')).toHaveCount(0);
	});

	test('Scenario: Paginated list moves to the next page', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		await page.getByLabel('Items per page').selectOption('1');
		const firstPageUser = await page.locator('ul.list > li').first().innerText();
		await expect(page.getByText(/Page 1 of [2-9]/)).toBeVisible();
		await page.getByRole('button', { name: /Next/ }).click();

		await expect(page.getByText(/Page 2 of [2-9]/)).toBeVisible();
		await expect(page.locator('ul.list > li')).toHaveCount(1);
		expect(await page.locator('ul.list > li').first().innerText()).not.toBe(firstPageUser);
	});

	test('Scenario: a popup menu opens and its action runs', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		await page.locator('ul.list > li').first().getByRole('button').last().click();
		await page.getByRole('button', { name: 'View More', exact: true }).click();

		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByRole('dialog').getByRole('button', { name: 'Close' })).toBeVisible();
		// Choosing a menu item closes the menu itself, not only opens what the item does.
		await expect(page.getByRole('button', { name: 'View More', exact: true })).toHaveCount(0);
	});

	test('Scenario: a popup menu closes when focus leaves it', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		await page.locator('ul.list > li').first().getByRole('button').last().click();
		await expect(page.getByRole('button', { name: 'View More', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Add User' }).focus();

		await expect(page.getByRole('button', { name: 'View More', exact: true })).toHaveCount(0);
	});
});

test.describe('app-platform: navigation shell and theme preserved', () => {
	test('Scenario: Small screens keep navigation reachable', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 800 });
		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('navigation')).toHaveCount(0);

		await page.getByRole('button', { name: 'Open menu' }).click();
		await page.getByRole('navigation').getByRole('link', { name: 'Maintenance' }).click();

		await expect(page).toHaveURL(/\/admin\/maintenance$/);
		await expect(page.getByRole('navigation')).toHaveCount(0);
		const overflows = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(overflows).toBe(false);
	});

	test('Scenario: the current page link keeps its highlight on hover', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		const link = page.getByRole('navigation').getByRole('link', { name: 'Properties' });

		await link.hover();

		await expect(link).toHaveCSS('background-color', 'rgb(255, 165, 0)');
	});

	test('Scenario: the brand theme colors are applied', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');

		const color = await page
			.getByRole('button', { name: 'Sign out' })
			.evaluate((el) => getComputedStyle(el).backgroundColor);

		// Primary 500 is #FFA500.
		expect(color).toBe('rgb(255, 165, 0)');
	});
});
