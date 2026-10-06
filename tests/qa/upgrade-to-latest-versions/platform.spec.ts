import { expect, test } from '@playwright/test';
import { noHScroll, shot, signIn, watch } from './helpers';

test.setTimeout(90000);
test.use({ actionTimeout: 10000 });
const CAP = 'app-platform';
const tmpEmail = `cblehman22+qa-tmp${Date.now()}@gmail.com`;

test.describe('Supported server runtime', () => {
	test('Scenario: CI and deploy use the supported runtime (site serves; log not visible)', async ({
		page
	}) => {
		const r = await page.goto('/signin');
		expect(r?.status()).toBe(200);
		await expect(page.getByText('Please sign in to continue.')).toBeVisible();
		await shot(page, `${CAP}-ci-and-deploy-use-the-supported-runtime`);
	});
});

test.describe('Modal dialogs', () => {
	test('Scenario: Admin confirms a destructive action (delete a qa- user)', async ({ page }) => {
		const w = watch(page, 'confirm');
		await signIn(page, 'admin');
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Add User' }).click();
		const prompt = page.getByRole('dialog');
		await expect(prompt).toBeVisible();
		await prompt.getByRole('textbox').fill(tmpEmail);
		await prompt.getByRole('button', { name: 'Submit' }).click();
		await expect(page.getByText('User Successfully Created.')).toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		const row = page.locator('ul.list > li', { hasText: tmpEmail });
		await expect(row).toBeVisible();
		await row.getByRole('button').last().click();
		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		const dlg = page.getByRole('dialog');
		await expect(dlg).toContainText('Are you sure you wish to delete');
		await dlg
			.getByRole('button', { name: /Confirm|Yes|OK|Delete/ })
			.first()
			.click();
		await expect(page.getByText('User Successfully Removed.')).toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(page.locator('ul.list > li', { hasText: tmpEmail })).toHaveCount(0);
		await shot(page, `${CAP}-admin-confirms-a-destructive-action`);
		w.report(test.info());
	});

	test('Scenario: Admin cancels a dialog', async ({ page }) => {
		await signIn(page, 'admin');
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');
		const rows = page.locator('ul.list > li');
		const before = await rows.count();
		await rows.first().getByRole('button').last().click();
		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		const dlg = page.getByRole('dialog');
		await expect(dlg).toBeVisible();
		await shot(page, `${CAP}-admin-cancels-a-dialog-open`);
		await dlg.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(rows).toHaveCount(before);
		await shot(page, `${CAP}-admin-cancels-a-dialog`);
	});
});

test.describe('Notifications', () => {
	test('Scenario: Success notification (tenant submits maintenance request)', async ({ page }) => {
		const w = watch(page, 'success');
		await signIn(page, 'tenant');
		const subject = `qa-leak ${Date.now()}`;
		await page.goto('/maintenance');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Subject').fill(subject);
		await page.getByLabel('Description').fill('qa- automated request, safe to ignore');
		await page.getByRole('button', { name: 'Add' }).click();
		await expect(page.getByText('Successfully added maintenance request.')).toBeVisible();
		await expect(page.locator('dl > div', { hasText: subject })).toBeVisible();
		await shot(page, `${CAP}-success-notification`);
		w.report(test.info());
	});

	test('Scenario: Error notification (validation rejects, values kept)', async ({ page }) => {
		await signIn(page, 'tenant');
		await page.goto('/maintenance');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Description').fill('qa- no subject');
		await page.getByRole('button', { name: 'Add' }).click();
		await expect(page.getByText('Successfully added maintenance request.')).toHaveCount(0);
		await expect(page.getByLabel('Description')).toHaveValue('qa- no subject');
		await shot(page, `${CAP}-error-notification`);
	});

	test('Scenario: Error notification toast on invalid add-user email, dismisses on its own', async ({
		page
	}) => {
		await signIn(page, 'admin');
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Add User' }).click();
		await page.getByRole('dialog').getByRole('textbox').fill('not-an-email');
		await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
		const toast = page.getByText('Please enter a valid email.');
		await expect(toast).toBeVisible();
		await shot(page, `${CAP}-error-toast-invalid-email`);
		await expect(toast).toHaveCount(0, { timeout: 20000 });
	});
});

test.describe('Menus, autocompletes, tabs and pagination', () => {
	test('Scenario: Paginated list', async ({ page }) => {
		await signIn(page, 'admin');
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Items per page').selectOption('1');
		const first = await page.locator('ul.list > li').first().innerText();
		await expect(page.getByText(/Page 1 of [2-9]/)).toBeVisible();
		await page.getByRole('button', { name: /Next/ }).click();
		await expect(page.getByText(/Page 2 of [2-9]/)).toBeVisible();
		expect(await page.locator('ul.list > li').first().innerText()).not.toBe(first);
		await shot(page, `${CAP}-paginated-list`);
	});

	test('Scenario: Tabs (user info modal, and popup menu by keyboard/mouse)', async ({ page }) => {
		await signIn(page, 'admin');
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');
		const row = page.locator('ul.list > li', { hasText: 'QA Tenant' });
		await row.getByRole('button').last().click();
		await expect(page.getByRole('button', { name: 'View More', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'View More', exact: true }).click();
		const dlg = page.getByRole('dialog');
		await expect(dlg).toBeVisible();
		await expect(page.getByRole('button', { name: 'View More', exact: true })).toHaveCount(0);
		await dlg.getByText('Insurance', { exact: true }).click();
		await expect(dlg.getByText(/No insurance info|Policy|Company/i).first()).toBeVisible();
		await shot(page, `${CAP}-tabs-user-info-insurance`);
		const tabs = await dlg
			.getByRole('tab')
			.allInnerTexts()
			.catch(() => []);
		console.log('user-info tabs', JSON.stringify(tabs));
		await dlg.getByRole('button', { name: 'Close' }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});
});

test.describe('Navigation shell and theme', () => {
	for (const role of ['admin', 'tenant'] as const) {
		test(`Scenario: Role-based navigation (${role})`, async ({ page }) => {
			await signIn(page, role);
			const nav = page.locator('aside nav');
			await expect(nav).toBeVisible();
			const items = await nav.getByRole('link').allInnerTexts();
			console.log(role, 'landing', page.url(), 'nav', JSON.stringify(items));
			if (role === 'admin') {
				expect(page.url()).toMatch(/\/admin$/);
				expect(items.map((s) => s.trim())).toEqual([
					'Home',
					'Profile',
					'Maintenance',
					'Properties',
					'Users'
				]);
			} else {
				expect(new URL(page.url()).pathname).toBe('/');
				expect(items.map((s) => s.trim())).toEqual([
					'Dashboard',
					'Maintenance',
					'Payment',
					'Profile',
					'Insurance',
					'About Us'
				]);
			}
			await shot(page, `${CAP}-role-based-navigation-${role}`);
		});

		test(`Scenario: Small screens (${role}, 390px)`, async ({ page }) => {
			await page.setViewportSize({ width: 390, height: 800 });
			await signIn(page, role);
			await expect(page.locator('aside nav')).toBeHidden();
			await page.getByRole('button', { name: 'Open menu' }).click();
			await expect(page.getByRole('navigation').first()).toBeVisible();
			await page.waitForTimeout(1000);
			await shot(page, `${CAP}-small-screens-menu-${role}`);
			const target = role === 'admin' ? 'Maintenance' : 'Payment';
			await page.getByRole('navigation').getByRole('link', { name: target }).click();
			await page.waitForLoadState('networkidle');
			await expect(page).toHaveURL(role === 'admin' ? /admin\/maintenance/ : /payment/);
			expect(await noHScroll(page)).toBe(true);
			await shot(page, `${CAP}-small-screens-${role}`);
		});
	}

	test('Scenario: Brand theme (#FFA500 buttons)', async ({ page }) => {
		await signIn(page, 'admin');
		const c = await page
			.getByRole('button', { name: 'Sign out' })
			.evaluate((e) => getComputedStyle(e).backgroundColor);
		expect(c).toBe('rgb(255, 165, 0)');
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');
		const c2 = await page
			.getByRole('button', { name: 'Add User' })
			.evaluate((e) => getComputedStyle(e).backgroundColor);
		expect(c2).toBe('rgb(255, 165, 0)');
		await shot(page, `${CAP}-brand-theme`);
	});
});

test.describe('Core flows unchanged', () => {
	test('Scenario: Payment start (tenant, Stripe test mode hand-off)', async ({ page }) => {
		const w = watch(page, 'pay');
		await signIn(page, 'tenant');
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Make a Payment' }).click();
		const dlg = page.getByRole('dialog');
		await dlg.getByRole('spinbutton').fill('10');
		await shot(page, `${CAP}-payment-start-dialog`);
		await dlg.getByRole('button', { name: 'Submit' }).click();
		await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
		await page.waitForLoadState('domcontentloaded');
		await page.waitForTimeout(4000);
		const text = await page.locator('body').innerText();
		console.log('stripe page snippet', JSON.stringify(text.replace(/\s+/g, ' ').slice(0, 400)));
		expect(text).toMatch(/10\.00/);
		expect(text).toMatch(/0\.59|Transaction Fee/); // 2.9% of 10 + 0.30 = 0.59
		await shot(page, `${CAP}-payment-start`);
		w.report(test.info());
	});

	test('Scenario: Regression suites (unit/handler/e2e) cannot run against the deployed site', async () => {
		test.skip(true, 'Suites run locally on emulators; not exercised by this deployed-site QA run');
	});
});
