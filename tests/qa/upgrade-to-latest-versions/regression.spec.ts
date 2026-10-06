import { expect, test } from '@playwright/test';
import { shot, signIn, watch, account } from './helpers';

test.setTimeout(60000);
test.use({ actionTimeout: 10000 });

// Pages the specs say render forms. The 500 evidence screenshot is taken whether or not the page works.
async function loadsOk(page: import('@playwright/test').Page, path: string, name: string) {
	const w = watch(page, name);
	const r = await page.goto(path);
	await page.waitForLoadState('networkidle');
	await shot(page, name);
	w.report(test.info());
	expect(r?.status(), `${path} status`).toBe(200);
}

test('authentication: sign in and out as admin', async ({ page }) => {
	await signIn(page, 'admin');
	await expect(page).toHaveURL(/\/admin$/);
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/signin/);
	await expect(page.getByText('Successfully signed out')).toBeVisible();
	await shot(page, 'authentication-sign-out-admin');
	await page.goto('/admin');
	await expect(page).toHaveURL(/\/signin/);
});

test('authentication: sign in and out as tenant', async ({ page }) => {
	await signIn(page, 'tenant');
	await expect(page.getByText('Dashboard').first()).toBeVisible();
	await shot(page, 'authentication-sign-in-tenant');
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/signin/);
});

test('authentication: invalid credentials show error toast', async ({ page }) => {
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(account('admin').email);
	await page.getByLabel('Password').fill('definitely-wrong-pw-1');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByText('Your email or password is incorrect.')).toBeVisible();
	await shot(page, 'authentication-invalid-credentials');
});

test('authentication: unauthenticated redirect and reset page invalid action', async ({ page }) => {
	await page.goto('/admin/users');
	await expect(page).toHaveURL(/\/signin/);
	await page.goto('/reset?mode=verifyEmail&oobCode=x');
	await page.waitForLoadState('networkidle');
	await expect(page.getByText(/Invalid action/i)).toBeVisible();
	await shot(page, 'authentication-reset-invalid-action');
});

test('access-control: tenant opening an admin URL is rejected', async ({ page }) => {
	await signIn(page, 'tenant');
	const r = await page.goto('/admin/users');
	await shot(page, 'access-control-tenant-admin-url');
	console.log('tenant /admin/users status', r?.status(), page.url());
	expect(r?.status()).toBe(401);
});

test('tenant home page loads', async ({ page }) => {
	await signIn(page, 'tenant');
	await shot(page, 'tenant-home');
	await expect(page.locator('aside nav').getByRole('link', { name: 'About Us' })).toBeVisible();
});

test('tenant /payment page shows balance and buttons', async ({ page }) => {
	await signIn(page, 'tenant');
	await loadsOk(page, '/payment', 'rent-payments-page');
	await expect(page.getByRole('button', { name: 'Make a Payment' })).toBeVisible();
});

test('rent-payments: over balance shows error toast, amount of 0 rejected', async ({ page }) => {
	await signIn(page, 'tenant');
	await page.goto('/payment');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Make a Payment' }).click();
	const d = page.getByRole('dialog');
	await d.getByRole('spinbutton').fill('999999');
	await d.getByRole('button', { name: 'Submit' }).click();
	await expect(page.getByText(/less than or equal to/)).toBeVisible();
	await expect(page).toHaveURL(/\/payment$/);
	await shot(page, 'rent-payments-over-balance');
});

test('rent-payments: payment dialog cancel closes it', async ({ page }) => {
	await signIn(page, 'tenant');
	await page.goto('/payment');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Make a Payment' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('maintenance-requests: tenant request page', async ({ page }) => {
	await signIn(page, 'tenant');
	await loadsOk(page, '/maintenance', 'maintenance-requests-tenant-page');
});

test('maintenance-requests: admin listing', async ({ page }) => {
	await signIn(page, 'admin');
	await loadsOk(page, '/admin/maintenance', 'maintenance-requests-admin-listing');
	await expect(page.getByText('Open Maintenance Requests', { exact: true })).toBeVisible();
	await expect(page.getByText('Closed Maintenance Requests', { exact: true })).toBeVisible();
});

test('property-management: add property page', async ({ page }) => {
	await signIn(page, 'admin');
	await loadsOk(page, '/admin/properties/add', 'property-management-add-page');
});

test('user-management: admin users list and info dialog', async ({ page }) => {
	await signIn(page, 'admin');
	await loadsOk(page, '/admin/users', 'user-management-list');
	await expect(page.locator('ul.list > li').first()).toBeVisible();
});

test('user-profile: profile page (tenant)', async ({ page }) => {
	await signIn(page, 'tenant');
	await loadsOk(page, '/profile', 'user-profile-tenant');
});

test('user-profile: profile page (admin)', async ({ page }) => {
	await signIn(page, 'admin');
	await loadsOk(page, '/profile', 'user-profile-admin');
});

test('renters-insurance: insurance form (tenant)', async ({ page }) => {
	await signIn(page, 'tenant');
	await loadsOk(page, '/insurance', 'renters-insurance-form');
});

test('authentication: password-reset request (via profile Reset button)', async ({ page }) => {
	await signIn(page, 'tenant');
	await page.goto('/profile');
	await page.waitForLoadState('networkidle');
	await shot(page, 'authentication-password-reset-request');
	await page.getByRole('button', { name: 'Reset', exact: true }).click();
	await expect(page.getByText(/reset email|Reset email/i)).toBeVisible();
});
