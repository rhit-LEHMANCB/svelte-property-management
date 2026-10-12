import { expect, test, type Locator, type Page } from '@playwright/test';
import { ADMIN, TENANT } from '../support/constants';
import { adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

// ui-accessibility: every dialog, menu, tab group, drawer, combobox, toast and pagination works by
// keyboard and exposes its role and name.

const KB_PROPERTY = 'e2e-keyboard-property';
const KB_TENANT = { id: 'e2e-kim', firstName: 'Kim', lastName: 'Keyboard', email: 'kim@e2e.test' };

const focusIsInside = (locator: Locator) =>
	locator.evaluate((el) => el.contains(document.activeElement));

async function openUsers(page: Page) {
	await signIn(page, ADMIN);
	await page.goto('/admin/users');
	await page.waitForLoadState('networkidle');
}

test.describe('ui-accessibility: dialogs trap and restore focus', () => {
	test('Scenario: Open and close by keyboard', async ({ page }) => {
		await openUsers(page);
		const opener = page.getByRole('button', { name: 'Add User' });
		await opener.focus();
		await page.keyboard.press('Enter');

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await expect.poll(() => focusIsInside(dialog)).toBe(true);

		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await expect(opener).toBeFocused();
	});

	test('Scenario: Focus stays inside', async ({ page }) => {
		await openUsers(page);
		await page.getByRole('button', { name: 'Add User' }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();

		for (let i = 0; i < 6; i++) {
			await page.keyboard.press('Tab');
			expect(await focusIsInside(dialog)).toBe(true);
		}
		for (let i = 0; i < 6; i++) {
			await page.keyboard.press('Shift+Tab');
			expect(await focusIsInside(dialog)).toBe(true);
		}
	});
});

test.describe('ui-accessibility: dialogs have an accessible name and description', () => {
	test('Scenario: Confirmation dialog', async ({ page }) => {
		await openUsers(page);
		await page
			.getByRole('button', { name: /^Actions for / })
			.first()
			.click();
		await page.getByRole('menuitem', { name: 'Delete' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toHaveAccessibleName('Please Confirm');
		await expect(dialog).toHaveAccessibleDescription(/Are you sure you wish to delete/);
		await dialog.getByRole('button', { name: 'Cancel' }).click();
	});

	test('Scenario: Detail dialog', async ({ page }) => {
		await openUsers(page);
		await page
			.getByRole('button', { name: `${ADMIN.firstName} ${ADMIN.lastName}`, exact: true })
			.click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toHaveAccessibleName(`${ADMIN.firstName} ${ADMIN.lastName}`);
		await expect(
			dialog.getByRole('heading', { name: `${ADMIN.firstName} ${ADMIN.lastName}` })
		).toBeVisible();
	});
});

test.describe('ui-accessibility: menus are operable by keyboard', () => {
	test('Scenario: Menu by keyboard', async ({ page }) => {
		await openUsers(page);
		const trigger = page.getByRole('button', { name: /^Actions for / }).first();
		const rowName = (await trigger.getAttribute('aria-label'))!.replace('Actions for ', '');
		await trigger.focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('menu')).toBeVisible();

		await page.keyboard.press('ArrowDown');
		await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute(
			'data-highlighted',
			''
		);
		await page.keyboard.press('Enter');

		const dialog = page.getByRole('dialog');
		await expect(dialog).toContainText(`Are you sure you wish to delete ${rowName}?`);
		await dialog.getByRole('button', { name: 'Cancel' }).click();
	});

	test('Scenario: Menu state is exposed, and Escape returns focus', async ({ page }) => {
		await openUsers(page);
		const trigger = page.getByRole('button', { name: /^Actions for / }).first();
		await expect(trigger).toHaveAttribute('aria-expanded', 'false');

		await trigger.focus();
		await page.keyboard.press('Enter');
		await expect(trigger).toHaveAttribute('aria-expanded', 'true');

		await page.keyboard.press('Escape');
		await expect(page.getByRole('menu')).toHaveCount(0);
		await expect(trigger).toHaveAttribute('aria-expanded', 'false');
		await expect(trigger).toBeFocused();
	});
});

test.describe('ui-accessibility: tabs, comboboxes on the property page', () => {
	test.beforeAll(async () => {
		const db = adminDb();
		await db.doc(`properties/${KB_PROPERTY}`).set({
			title: 'E2E Keyboard Court',
			description: 'Keyboard test property',
			bedrooms: 1,
			bathrooms: 1,
			squareFeet: 500,
			rent: 800,
			streetAddress: '4 Main St',
			apartmentInfo: '',
			city: 'Terre Haute',
			state: 'IN',
			zip: '47802'
		});
		await db.doc(`users/${KB_TENANT.id}`).set({
			email: KB_TENANT.email,
			firstName: KB_TENANT.firstName,
			lastName: KB_TENANT.lastName,
			phoneNumber: '+15555550143',
			permissions: 'user'
		});
		await db.doc(`junction_user_property/${KB_TENANT.id}_${KB_PROPERTY}`).delete();
	});

	async function openProperty(page: Page) {
		await page.route('**/maps.googleapis.com/**', (route) => route.abort());
		await signIn(page, ADMIN);
		await page.goto(`/admin/properties/${KB_PROPERTY}/edit`);
		await page.waitForLoadState('networkidle');
	}

	test('Scenario: Arrow keys switch tabs, and roles are exposed', async ({ page }) => {
		await openProperty(page);
		await expect(page.getByRole('tablist')).toHaveCount(1);
		await expect(page.getByRole('tab')).toHaveCount(3);
		const info = page.getByRole('tab', { name: 'Info' });
		await expect(info).toHaveAttribute('aria-selected', 'true');

		await info.focus();
		await page.keyboard.press('ArrowRight');

		const photos = page.getByRole('tab', { name: 'Photos' });
		await expect(photos).toHaveAttribute('aria-selected', 'true');
		await expect(info).toHaveAttribute('aria-selected', 'false');
		await expect(page.getByRole('tabpanel')).toContainText('Photos');
		await expect(page.locator('input[type="file"][name="photos"]')).toBeVisible();
		await expect(page.getByLabel('Title')).toHaveCount(0);
	});

	test('Scenario: Choose by keyboard, and No matches', async ({ page }) => {
		await openProperty(page);
		await page.getByRole('tab', { name: 'Tenants' }).click();
		const input = page.getByRole('combobox', { name: 'Tenant' });

		await input.fill('zzzz');
		await expect(page.getByText('No results found.')).toBeVisible();

		await input.fill('Kim');
		await expect(input).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Enter');
		await expect(input).toHaveValue('Kim Keyboard');
		await expect(input).toHaveAttribute('aria-expanded', 'false');

		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByText('Successfully added tenant.')).toBeVisible();
		await expect(page.getByText(KB_TENANT.email)).toBeVisible();
		await expect(input).toHaveValue('');
	});
});

test.describe('ui-accessibility: navigation drawer manages focus', () => {
	test('Scenario: Drawer by keyboard', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 800 });
		await signIn(page, TENANT);
		await page.waitForLoadState('networkidle');
		const button = page.getByRole('button', { name: 'Open menu' });

		await button.focus();
		await page.keyboard.press('Enter');
		const drawer = page.getByRole('dialog', { name: 'Menu' });
		await expect(drawer).toBeVisible();
		// The page behind a modal drawer is hidden from assistive technology, so find it by its label.
		await expect(page.locator('button[aria-label="Open menu"]')).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		await expect.poll(() => focusIsInside(drawer)).toBe(true);
		await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

		await page.keyboard.press('Escape');
		await expect(drawer).toHaveCount(0);
		await expect(button).toBeFocused();
	});
});

test.describe('ui-accessibility: drawer returns focus after a link is chosen', () => {
	test('Scenario: Choosing a drawer link closes it and focus returns to the menu button', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 800 });
		await signIn(page, TENANT);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Open menu' }).click();
		const drawer = page.getByRole('dialog', { name: 'Menu' });
		await drawer.getByRole('link', { name: 'Payment' }).focus();
		await page.keyboard.press('Enter');

		await expect(page).toHaveURL(/\/payment$/);
		await expect(drawer).toHaveCount(0);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
		// It stays there once navigation has settled (the bug was a late reset to the page body).
		await expect
			.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')), {
				intervals: [250, 250, 250, 250]
			})
			.toBe('Open menu');
	});
});

test.describe('ui-accessibility: notifications use the right live-region roles', () => {
	test('Scenario: Success notification', async ({ page }) => {
		await page.route('**/api/signin/reset', (route) => route.fulfill({ status: 200, body: '{}' }));
		await signIn(page, TENANT);
		await page.goto('/profile');
		await page.waitForLoadState('networkidle');
		const reset = page.getByRole('button', { name: 'Reset', exact: true });
		await reset.click();

		const toast = page.getByRole('status').filter({ hasText: 'Reset email successfully sent.' });
		await expect(toast).toBeVisible();
		await expect(reset).toBeFocused();
		await expect(page.getByRole('region', { name: 'Notifications' })).toHaveAttribute(
			'aria-live',
			'polite'
		);
	});

	test('Scenario: Error notification is an alert that can be dismissed by keyboard', async ({
		page
	}) => {
		await page.route('**/api/signin/reset', (route) => route.fulfill({ status: 500, body: '{}' }));
		await signIn(page, TENANT);
		await page.goto('/profile');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Reset', exact: true }).click();

		const toast = page.getByRole('alert').filter({ hasText: 'Error sending reset email.' });
		await expect(toast).toBeVisible();
		await toast.getByRole('button', { name: 'Dismiss' }).focus();
		await page.keyboard.press('Enter');
		await expect(toast).toHaveCount(0);
	});
});

test.describe('ui-accessibility: pagination is operable and labeled', () => {
	test('Scenario: Page by keyboard', async ({ page }) => {
		await openUsers(page);
		const pages = page.getByRole('navigation', { name: 'Pages of users' });
		await pages.getByLabel('Items per page').selectOption('1');
		const previous = pages.getByRole('button', { name: 'Previous page' });
		const next = pages.getByRole('button', { name: 'Next page' });
		await expect(previous).toBeDisabled();

		await next.focus();
		await page.keyboard.press('Enter');

		await expect(pages.getByText(/Page 2 of ([2-9]|\d{2,})/)).toBeVisible();
		await expect(previous).toBeEnabled();
	});
});
