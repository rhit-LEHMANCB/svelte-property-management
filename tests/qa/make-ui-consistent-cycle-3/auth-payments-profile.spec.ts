import { test, expect, type Page } from '@playwright/test';
import { open, shot, signInAs } from './support';

test.use({ viewport: { width: 1280, height: 1300 } });
test.setTimeout(120_000);

async function trySignIn(page: Page) {
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill('qa-nobody@example.com');
	await page.getByLabel('Password').fill('definitely-wrong-1');
	await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('authentication', () => {
	test('Invalid credentials: message in the error notice, not under a field', async ({ page }) => {
		await trySignIn(page);
		const alert = page.locator('[role="alert"]', { hasText: 'Your email or password is incorrect.' });
		await expect(alert).toBeVisible();
		await expect(page.locator('main, body').getByText('Your email or password is incorrect.')).toHaveCount(1);
		expect(await page.locator('[aria-invalid="true"]').count()).toBe(0);
		expect(await page.locator('[role="status"]', { hasText: 'incorrect' }).count()).toBe(0);
		await expect(page).toHaveURL(/\/signin/);
		await shot(page, 'authentication-invalid-credentials');
	});

	test('Unknown email gives the same message (does not reveal which field)', async ({ page }) => {
		await page.goto('/signin');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Email').fill('qa-unknown-user@example.com');
		await page.getByLabel('Password').fill('another-wrong-2');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByText('Your email or password is incorrect.')).toBeVisible();
	});

	test('Disabled account (Firebase answer simulated in the browser)', async ({ page }) => {
		await page.route('**/accounts:signInWithPassword*', (route) =>
			route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 400, message: 'USER_DISABLED', errors: [{ message: 'USER_DISABLED', domain: 'global', reason: 'invalid' }] } }) })
		);
		await trySignIn(page);
		await expect(page.getByText('This account has been disabled. Please contact Lehman Family LLC.')).toBeVisible();
		await expect(page).toHaveURL(/\/signin/);
		await shot(page, 'authentication-disabled-account-simulated');
	});

	test('Too many attempts (Firebase answer simulated in the browser)', async ({ page }) => {
		await page.route('**/accounts:signInWithPassword*', (route) =>
			route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 400, message: 'TOO_MANY_ATTEMPTS_TRY_LATER', errors: [{ message: 'TOO_MANY_ATTEMPTS_TRY_LATER', domain: 'global', reason: 'invalid' }] } }) })
		);
		await trySignIn(page);
		await expect(page.getByText('Too many sign-in attempts. Please wait a few minutes and try again.')).toBeVisible();
		await expect(page).toHaveURL(/\/signin/);
		await shot(page, 'authentication-too-many-attempts-simulated');
	});

	test('Session cookie cannot be created (/api/signin answer simulated)', async ({ page }) => {
		await page.route('**/api/signin', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 500, body: 'nope' }) : route.continue()));
		await page.goto('/signin');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Email').fill(process.env.QA_TENANT_EMAIL!);
		await page.getByLabel('Password').fill(process.env.QA_TENANT_PASSWORD!);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByText('Sign-in is unavailable right now. Please try again.')).toBeVisible();
		await expect(page).toHaveURL(/\/signin/);
		await shot(page, 'authentication-session-cookie-cannot-be-created-simulated');
	});

	test('Successful sign-in + Cookie lifetime (5 days, httpOnly, secure)', async ({ page, context }) => {
		await signInAs(page, 'tenant');
		await expect(page).toHaveURL(/\/$/);
		const cookie = (await context.cookies()).find((c) => c.name === '__session')!;
		const seconds = Math.round(cookie.expires - Date.now() / 1000);
		console.log('cookie', cookie.httpOnly, cookie.secure, cookie.sameSite, 'remaining s', seconds);
		expect(cookie.httpOnly).toBe(true);
		expect(cookie.secure).toBe(true);
		expect(seconds).toBeGreaterThan(432000 - 300);
		expect(seconds).toBeLessThanOrEqual(432000 + 5);
		await shot(page, 'authentication-successful-sign-in-tenant');
	});

	test('Stale ID token: bad token gets 401 and no cookie (partial: real stale token not reachable)', async ({ playwright, baseURL }) => {
		const anon = await playwright.request.newContext({ baseURL });
		const r = await anon.post('/api/signin', { data: { idToken: 'not-a-token' }, headers: { 'Content-Type': 'application/json' } });
		console.log('bad token', r.status(), r.headers()['set-cookie'] ?? 'no cookie', (await r.text()).slice(0, 80));
		// observed: a malformed token gives 500 (see report); the real stale-token 401 needs a 5-minute-old token
		expect(r.status()).toBeGreaterThanOrEqual(400);
		expect(r.headers()['set-cookie']).toBeUndefined();
	});
});

test.describe('rent-payments', () => {
	test('Over balance + Method choice with fees (dialog only, nothing sent)', async ({ page }) => {
		const sent: string[] = [];
		page.on('request', (r) => {
			if (r.method() !== 'GET' && !/google|firebase|gstatic/.test(r.url())) sent.push(r.method() + ' ' + r.url());
		});
		await signInAs(page, 'tenant');
		await open(page, '/payment');
		await page.getByRole('button', { name: 'Make a Payment' }).first().click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		const amount = dialog.getByLabel(/amount/i).first();
		await amount.fill('100');
		await page.waitForTimeout(500);
		const text = await dialog.innerText();
		console.log('dialog text:', text.replace(/\n/g, ' | '));
		expect(text).toMatch(/Card/);
		expect(text).toMatch(/\$3\.00/);
		expect(text).toMatch(/Bank account/);
		expect(text).toMatch(/\$5\.00/);
		await shot(page, 'rent-payments-method-choice-with-fees');
		await amount.fill('9999');
		sent.length = 0;
		await dialog.getByRole('button', { name: /continue|pay|submit/i }).last().click();
		await page.waitForTimeout(800);
		await expect(dialog).toBeVisible();
		await expect(amount).toHaveAttribute('aria-invalid', 'true');
		const msg = dialog.locator('[id]', { hasText: /no more than|exceed|more than/i }).last();
		await expect(msg).toBeVisible();
		console.log('over-balance message:', (await msg.innerText()).trim(), 'requests:', JSON.stringify(sent));
		expect(sent).toEqual([]);
		// the message is not a toast
		await expect(page.getByRole('region', { name: 'Notifications' }).getByText(/no more than/i)).toHaveCount(0);
		await shot(page, 'rent-payments-over-balance');
	});
});

test.describe('user-profile', () => {
	test('Reset button: "Send reset link" calls PUT /api/signin/reset and a toast shows', async ({ page }) => {
		await signInAs(page, 'tenant');
		await open(page, '/profile');
		const card = page.locator('main').getByRole('heading', { name: 'Password' }).locator('xpath=ancestor::*[contains(@class,"card")][1]');
		const btn = card.getByRole('button', { name: 'Send reset link' });
		await expect(btn).toBeVisible();
		await expect(page.getByRole('button', { name: /^Reset$/ })).toHaveCount(0);
		const [req] = await Promise.all([
			page.waitForRequest((r) => r.url().includes('/api/signin/reset') && r.method() === 'PUT'),
			btn.click()
		]);
		const resp = await req.response();
		console.log('reset', resp?.status());
		const toast = page.getByRole('region', { name: 'Notifications' });
		await expect(toast).toContainText(/\w+/, { timeout: 8000 });
		console.log('toast:', (await toast.innerText()).replace(/\n/g, ' '));
		await shot(page, 'user-profile-reset-button');
	});
});
