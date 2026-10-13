import { expect, test } from '@playwright/test';
import { ADMIN, TENANT } from '../support/constants';
import { adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

// app-platform: the UI building blocks (dialogs, notifications, menus, autocompletes, tabs,
// pagination, navigation shell) keep working across framework and dependency upgrades.

const AC_PROPERTY = 'e2e-autocomplete-property';

test.describe('app-platform: modal dialogs keep working', () => {
	test('Scenario: Admin cancels a dialog', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		const rows = page.getByRole('table', { name: 'properties' }).locator('tbody tr');
		const before = await rows.count();
		expect(before).toBeGreaterThan(0);

		await rows
			.first()
			.getByRole('button', { name: /^Actions for / })
			.click();
		await page.getByRole('menuitem', { name: 'Delete' }).click();
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
	});

	test('Scenario: Tabs show one panel at a time', async ({ page }) => {
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
		const rows = page.getByRole('table', { name: 'users' }).locator('tbody tr');
		const firstPageUser = await rows.first().innerText();
		await expect(page.getByText(/Page 1 of ([2-9]|\d{2,})/)).toBeVisible();
		await page.getByRole('button', { name: /Next/ }).click();

		await expect(page.getByText(/Page 2 of ([2-9]|\d{2,})/)).toBeVisible();
		await expect(rows).toHaveCount(1);
		expect(await rows.first().innerText()).not.toBe(firstPageUser);
	});

	test('Scenario: a popup menu opens and its action runs', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		await page
			.getByRole('button', { name: /^Actions for / })
			.first()
			.click();
		await page.getByRole('menuitem', { name: 'View More', exact: true }).click();

		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByRole('dialog').getByRole('button', { name: 'Close' })).toBeVisible();
		// Choosing a menu item closes the menu itself, not only opens what the item does.
		await expect(page.getByRole('menuitem', { name: 'View More', exact: true })).toHaveCount(0);
	});

	test('Scenario: a popup menu closes when focus leaves it', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		await page
			.getByRole('button', { name: /^Actions for / })
			.first()
			.click();
		await expect(page.getByRole('menuitem', { name: 'View More', exact: true })).toBeVisible();
		// The menu moves focus into itself once it has opened; wait for that before moving it out.
		await expect
			.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="menu"]')))
			.toBe(true);
		await page.getByRole('button', { name: 'Add User' }).focus();

		await expect(page.getByRole('menuitem', { name: 'View More', exact: true })).toHaveCount(0);
	});
});

test.describe('app-platform: navigation shell and theme preserved', () => {
	test('Scenario: Small screens keep navigation reachable', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 800 });
		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		const mainNavigation = page.getByRole('navigation', { name: 'Main' });
		await expect(mainNavigation).toHaveCount(0);

		await page.getByRole('button', { name: 'Open menu' }).click();
		await mainNavigation.getByRole('link', { name: 'Maintenance' }).click();

		await expect(page).toHaveURL(/\/admin\/maintenance$/);
		await expect(mainNavigation).toHaveCount(0);
		const overflows = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(overflows).toBe(false);
	});

	test('Scenario: Current page is indicated, and keeps its highlight on hover', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		const navigation = page.getByRole('navigation', { name: 'Main' });
		const link = navigation.getByRole('link', { name: 'Properties' });

		await expect(link).toHaveAttribute('aria-current', 'page');
		await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
		const highlight = await link.evaluate((el) => getComputedStyle(el).backgroundColor);
		await link.hover();
		await expect(link).toHaveCSS('background-color', highlight);
		await expect(navigation.getByRole('link', { name: 'Users' })).not.toHaveAttribute(
			'aria-current'
		);
	});
});

test.describe('app-platform: navigation and clickable controls look interactive', () => {
	test('Scenario: navigation entries span the width of the sidebar', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		const navigation = page.getByRole('navigation', { name: 'Main' });
		// The sidebar is 16rem wide with 1rem of padding on each side.
		const sidebar = (await page.locator('aside').boundingBox())!;

		for (const name of ['Home', 'Properties', 'Users']) {
			const box = (await navigation.getByRole('link', { name }).boundingBox())!;
			expect(box.width, name).toBeGreaterThanOrEqual(sidebar.width - 2 * 16 - 2);
		}
	});

	test('Scenario: clickable controls show the pointer cursor, disabled ones do not', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Items per page').selectOption('1');

		for (const control of [
			page.getByRole('button', { name: 'Add User' }),
			page.getByRole('button', { name: 'Dark mode' }),
			page.getByRole('button', { name: 'Sign out' }),
			page.getByRole('button', { name: /^Actions for / }).first(),
			page.getByRole('columnheader', { name: 'Name' }).getByRole('button'),
			page.getByRole('button', { name: 'Next page' }),
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' })
		]) {
			await expect(control).toHaveCSS('cursor', 'pointer');
		}
		await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Previous page' })).not.toHaveCSS(
			'cursor',
			'pointer'
		);

		await page
			.getByRole('button', { name: /^Actions for / })
			.first()
			.click();
		await expect(page.getByRole('menuitem', { name: 'View More' })).toHaveCSS('cursor', 'pointer');
	});
});
