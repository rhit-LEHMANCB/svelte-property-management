import { expect, test } from '@playwright/test';
import { ADMIN, APP_URL, TENANT } from '../support/constants';
import { signIn } from '../support/helpers';

test.describe('authentication and access-control', () => {
	test('Scenario: Successful sign-in lands a tenant on / with the tenant navigation and a secure session cookie', async ({
		page,
		context
	}) => {
		await signIn(page, TENANT);

		await expect(page).toHaveURL(`${APP_URL}/`);
		const nav = page.getByRole('navigation');
		for (const item of [
			'Dashboard',
			'Maintenance',
			'Payment',
			'Profile',
			'Insurance',
			'About Us'
		]) {
			await expect(nav.getByRole('link', { name: item, exact: true })).toBeVisible();
		}
		for (const item of ['Properties', 'Users']) {
			await expect(nav.getByRole('link', { name: item, exact: true })).toHaveCount(0);
		}

		const session = (await context.cookies()).find((cookie) => cookie.name === '__session');
		expect(session).toBeDefined();
		expect(session?.httpOnly).toBe(true);
		expect(session?.secure).toBe(true);
		expect(session?.path).toBe('/');
	});

	test('Scenario: an admin is sent from / to /admin and sees the admin navigation', async ({
		page
	}) => {
		await signIn(page, ADMIN);

		await expect(page).toHaveURL(`${APP_URL}/admin`);
		const nav = page.getByRole('navigation');
		for (const item of ['Home', 'Maintenance', 'Properties', 'Users', 'Profile']) {
			await expect(nav.getByRole('link', { name: item, exact: true })).toBeVisible();
		}
		for (const item of ['Dashboard', 'Payment', 'Insurance', 'About Us']) {
			await expect(nav.getByRole('link', { name: item, exact: true })).toHaveCount(0);
		}
	});

	test('Scenario: Invalid credentials show an error toast and stay on the sign-in page', async ({
		page
	}) => {
		await page.goto('/signin');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Email').fill(TENANT.email);
		await page.getByLabel('Password').fill('not-the-password');
		await page.getByRole('button', { name: 'Sign in' }).click();

		await expect(page.getByText('Your email or password is incorrect.')).toBeVisible();
		await expect(page).toHaveURL(/\/signin/);
	});

	test('Scenario: Sign-out removes the session so protected pages redirect to /signin', async ({
		page,
		context
	}) => {
		await signIn(page, TENANT);

		await page.getByRole('button', { name: 'Sign out' }).click();

		await expect(page).toHaveURL(/\/signin/);
		expect((await context.cookies()).find((cookie) => cookie.name === '__session')).toBeUndefined();
		await page.goto('/maintenance');
		await expect(page).toHaveURL(/\/signin/);
	});

	test('Scenario: Unauthenticated page request is redirected to /signin', async ({ page }) => {
		await page.goto('/maintenance');

		await expect(page).toHaveURL(/\/signin/);
	});
});
