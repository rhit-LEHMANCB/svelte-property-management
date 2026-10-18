import { test } from '@playwright/test';
import { box, expect, go, shot, signInAs } from './support';

test.use({ viewport: { width: 1280, height: 900 } });

async function attempt(
	page: import('@playwright/test').Page,
	email = 'qa-nobody@example.com',
	password = 'not-the-password'
) {
	await go(page, '/signin');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

test('Invalid credentials: message in the error notice above the button, not under a field', async ({
	page
}) => {
	await attempt(page);
	const n = page.locator('[data-notice="error"]');
	await expect(n).toHaveText('Your email or password is incorrect.');
	await expect(n).toHaveAttribute('role', 'alert');
	const nb = await box(n);
	const bb = await box(page.getByRole('button', { name: 'Sign in' }));
	expect(nb.y + nb.height).toBeLessThanOrEqual(bb.y);
	await expect(page.locator('[data-field-error]')).toHaveCount(0);
	await expect(page.locator('[role="status"][class*="toast"], [data-toast]')).toHaveCount(0);
	await expect(page).toHaveURL(/\/signin/);
	await shot(page, 'authentication-invalid-credentials');
	// A second attempt replaces the message, it does not stack.
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.locator('[data-notice="error"]')).toHaveCount(1);
});

test('Disabled account: message shown, stays on /signin (Firebase response simulated)', async ({
	page
}) => {
	await page.route(/identitytoolkit\.googleapis\.com\/.*signInWithPassword/, (r) =>
		r.fulfill({
			status: 400,
			contentType: 'application/json',
			body: JSON.stringify({ error: { code: 400, message: 'USER_DISABLED' } })
		})
	);
	await attempt(page);
	await expect(page.locator('[data-notice="error"]')).toHaveText(
		'This account has been disabled. Please contact Lehman Family LLC.'
	);
	await expect(page).toHaveURL(/\/signin/);
	await shot(page, 'authentication-disabled-account');
});

test('Too many attempts: message shown, stays on /signin (Firebase response simulated)', async ({
	page
}) => {
	await page.route(/identitytoolkit\.googleapis\.com\/.*signInWithPassword/, (r) =>
		r.fulfill({
			status: 400,
			contentType: 'application/json',
			body: JSON.stringify({ error: { code: 400, message: 'TOO_MANY_ATTEMPTS_TRY_LATER' } })
		})
	);
	await attempt(page);
	await expect(page.locator('[data-notice="error"]')).toHaveText(
		'Too many sign-in attempts. Please wait a few minutes and try again.'
	);
	await expect(page).toHaveURL(/\/signin/);
	await shot(page, 'authentication-too-many-attempts');
});

test('Session cookie cannot be created: message shown, stays on /signin (/api/signin failure simulated)', async ({
	page
}) => {
	await page.route('**/api/signin', (r) =>
		r.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
	);
	await attempt(page, process.env.QA_TENANT_EMAIL!, process.env.QA_TENANT_PASSWORD!);
	await expect(page.locator('[data-notice="error"]')).toHaveText(
		'Sign-in is unavailable right now. Please try again.'
	);
	await expect(page).toHaveURL(/\/signin/);
	// Fill-free proof screenshot: the email field is masked.
	await shot(page, 'authentication-session-cookie-cannot-be-created');
});

test('Successful sign-in + Cookie lifetime: posts the ID token, cookie Max-Age 432000, lands on /', async ({
	page
}) => {
	await go(page, '/signin');
	await page.getByLabel('Email').fill(process.env.QA_TENANT_EMAIL!);
	await page.getByLabel('Password').fill(process.env.QA_TENANT_PASSWORD!);
	const resp = page.waitForResponse(
		(r) => r.url().endsWith('/api/signin') && r.request().method() === 'POST'
	);
	await page.getByRole('button', { name: 'Sign in' }).click();
	const r = await resp;
	const setCookie = (await r.headersArray())
		.filter((h) => h.name.toLowerCase() === 'set-cookie')
		.map((h) => h.value.replace(/__session=[^;]+/, '__session=<redacted>'));
	console.log('SIGNIN', r.status(), JSON.stringify(setCookie));
	expect(r.status()).toBe(200);
	expect(setCookie.join(';')).toMatch(/Max-Age=432000/i);
	expect(setCookie.join(';')).toMatch(/HttpOnly/i);
	expect(setCookie.join(';')).toMatch(/Secure/i);
	await expect(page).toHaveURL(/lehman-realty-dev\.web\.app\/$/);
	await shot(page, 'authentication-successful-sign-in');
});

test('Stale ID token (probe only): a junk token sets no cookie', async ({ request }) => {
	// A genuinely stale token (auth_time >= 5 minutes old) is not exercised here; this only checks that a bad token never yields a cookie.
	const r = await request.post('/api/signin', { data: { idToken: 'qa-invalid-token' } });
	console.log(
		'STALE-PROBE',
		r.status(),
		(await r.text()).slice(0, 80),
		JSON.stringify(r.headers()['set-cookie'] ?? null)
	);
	expect(r.status()).toBeGreaterThanOrEqual(400);
	expect(r.headers()['set-cookie']).toBeUndefined();
});
