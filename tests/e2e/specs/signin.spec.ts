import { expect, test } from '@playwright/test';
import { ADMIN, APP_URL, TENANT } from '../support/constants';
import { signIn } from '../support/helpers';
import { adminAuth } from '../support/admin';

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

	test('Scenario: Disabled account shows its own message and stays on the sign-in page', async ({
		page
	}) => {
		const unique = `${Date.now()}-${test.info().retry}`;
		const account = { email: `disabled-${unique}@e2e.test`, password: 'Disabled-Passw0rd1' };
		await adminAuth().createUser({ uid: `e2e-disabled-${unique}`, ...account, disabled: true });

		await page.goto('/signin');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Email').fill(account.email);
		await page.getByLabel('Password').fill(account.password);
		await page.getByRole('button', { name: 'Sign in' }).click();

		await expect(
			page.getByText('This account has been disabled. Please contact Lehman Family LLC.')
		).toBeVisible();
		await expect(page).toHaveURL(/\/signin/);
	});

	test('Scenario: Session cookie cannot be created shows the unavailable message and stays on /signin', async ({
		page,
		context
	}) => {
		await page.route('**/api/signin', (route) =>
			route.request().method() === 'POST'
				? route.fulfill({ status: 500, body: '{}' })
				: route.continue()
		);
		await page.goto('/signin');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Email').fill(TENANT.email);
		await page.getByLabel('Password').fill(TENANT.password);
		await page.getByRole('button', { name: 'Sign in' }).click();

		await expect(
			page.getByText('Sign-in is unavailable right now. Please try again.')
		).toBeVisible();
		await expect(page).toHaveURL(/\/signin/);
		expect((await context.cookies()).find((cookie) => cookie.name === '__session')).toBeUndefined();
	});
});

test.describe('authentication: forgot password page', () => {
	test('Scenario: Request from the sign-in page shows the generic answer', async ({ page }) => {
		await page.goto('/signin');
		await page.getByRole('link', { name: 'Forgot password?' }).click();
		await expect(page).toHaveURL(/\/forgot$/);

		// An address with no account: the answer must not differ from a real one, and no email is sent.
		await page.getByLabel('Email').fill(`nobody-${Date.now()}@e2e.test`);
		await page.getByRole('button', { name: 'Send reset link' }).click();

		await expect(
			page.getByText("If an account exists for that email, we've sent a reset link.")
		).toBeVisible();
		await page.getByRole('link', { name: 'Back to sign in' }).click();
		await expect(page).toHaveURL(/\/signin$/);
	});

	test('Scenario: Forgot password page is public and works without scripts', async ({
		browser
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();

		await page.goto('/forgot');
		await expect(page).toHaveURL(/\/forgot$/);
		await page.getByLabel('Email').fill(`nobody-nojs-${Date.now()}@e2e.test`);
		await page.getByRole('button', { name: 'Send reset link' }).click();

		await expect(
			page.getByText("If an account exists for that email, we've sent a reset link.")
		).toBeVisible();
		await context.close();
	});
});
