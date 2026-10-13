import { test, expect, type Page } from '@playwright/test';

const SHOTS = 'openspec/changes/password-reset-and-signin/qa/screenshots';
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const runId = Date.now().toString(36);
const unknown = (tag: string) => `qa-${tag}-${runId}@example.com`;

const MSG = {
	sent: "If an account exists for that email, we've sent a reset link.",
	wrong: 'Your email or password is incorrect.',
	disabled: 'This account has been disabled. Please contact Lehman Family LLC.',
	many: 'Too many sign-in attempts. Please wait a few minutes and try again.',
	unavailable: 'Sign-in is unavailable right now. Please try again.',
	changed: 'Your password was changed. Please sign in.'
};

const need = (n: string) => {
	const v = process.env[n];
	if (!v) throw new Error(`missing env ${n}`);
	return v;
};

async function signInUi(page: Page, email: string, password: string) {
	await page.goto('/signin');
	await page.locator('html[data-hydrated]').waitFor({ timeout: 15000 }).catch(() => undefined);
	await page.getByTitle('Email').fill(email);
	await page.getByTitle('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('session establishment', () => {
	test('Successful sign-in + Cookie lifetime (admin)', async ({ page, context }) => {
		await signInUi(page, need('QA_ADMIN_EMAIL'), need('QA_ADMIN_PASSWORD'));
		await page.waitForURL((u) => u.pathname === '/', { timeout: 20000 });
		const c = (await context.cookies()).find((x) => x.name === '__session');
		expect(c).toBeTruthy();
		expect(c!.httpOnly).toBe(true);
		expect(c!.secure).toBe(true);
		const days = (c!.expires - Date.now() / 1000) / 86400;
		expect(days).toBeGreaterThan(4.9);
		expect(days).toBeLessThanOrEqual(5.01);
		await shot(page, 'authentication-successful-sign-in-admin');
	});

	test('Successful sign-in (tenant)', async ({ page }) => {
		await signInUi(page, need('QA_TENANT_EMAIL'), need('QA_TENANT_PASSWORD'));
		await page.waitForURL((u) => u.pathname === '/', { timeout: 20000 });
		await shot(page, 'authentication-successful-sign-in-tenant');
	});

	test('Stale ID token / no token is rejected by /api/signin', async ({ request }) => {
		const r = await request.post('/api/signin', { data: { idToken: 'not-a-token' } });
		expect(r.ok()).toBe(false);
		expect(r.headers()['set-cookie'] ?? '').not.toContain('__session=');
	});

	test('Invalid credentials', async ({ page }) => {
		await signInUi(page, need('QA_TENANT_EMAIL'), 'Wrong-password-1!');
		await expect(page.getByText(MSG.wrong)).toBeVisible({ timeout: 15000 });
		await expect(page).toHaveURL(/\/signin/);
		await shot(page, 'authentication-invalid-credentials');
	});

	for (const [slug, code, text] of [
		['disabled-account', 'auth/user-disabled', MSG.disabled],
		['too-many-attempts', 'auth/too-many-requests', MSG.many]
	] as const) {
		test(`${slug} (Firebase response intercepted)`, async ({ page }) => {
			await page.route('**/accounts:signInWithPassword*', (route) =>
				route.fulfill({
					status: 400,
					contentType: 'application/json',
					body: JSON.stringify({
						error: {
							code: 400,
							message: code === 'auth/user-disabled' ? 'USER_DISABLED' : 'TOO_MANY_ATTEMPTS_TRY_LATER'
						}
					})
				})
			);
			await signInUi(page, 'qa-intercept@example.com', 'Whatever-1234');
			await expect(page.getByText(text)).toBeVisible({ timeout: 15000 });
			await expect(page).toHaveURL(/\/signin/);
			await shot(page, `authentication-${slug}`);
		});
	}

	test('Session cookie cannot be created (/api/signin intercepted to 500)', async ({ page }) => {
		await page.route('**/api/signin', (route) => {
			if (route.request().method() === 'POST') return route.fulfill({ status: 500, body: 'boom' });
			return route.continue();
		});
		await signInUi(page, need('QA_TENANT_EMAIL'), need('QA_TENANT_PASSWORD'));
		await expect(page.getByText(MSG.unavailable)).toBeVisible({ timeout: 20000 });
		await expect(page).toHaveURL(/\/signin/);
		await shot(page, 'authentication-session-cookie-cannot-be-created');
	});
});

test.describe('sign-in before hydration', () => {
	test.use({ javaScriptEnabled: false });

	test('Submit without JavaScript sets cookie and goes to /', async ({ page, context }) => {
		await page.goto('/signin');
		await page.getByTitle('Email').fill(need('QA_TENANT_EMAIL'));
		await page.getByTitle('Password').fill(need('QA_TENANT_PASSWORD'));
		await page.getByRole('button', { name: 'Sign in' }).click();
		await page.waitForURL((u) => u.pathname === '/', { timeout: 20000 });
		expect((await context.cookies()).some((c) => c.name === '__session')).toBe(true);
		await shot(page, 'authentication-submit-before-hydration');
	});

	test('Wrong credentials on the POST form keeps the email', async ({ page }) => {
		await page.goto('/signin');
		await page.getByTitle('Email').fill('qa-wrong@example.com');
		await page.getByTitle('Password').fill('Wrong-password-1!');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByText(MSG.wrong)).toBeVisible({ timeout: 15000 });
		await expect(page.getByTitle('Email')).toHaveValue('qa-wrong@example.com');
		await shot(page, 'authentication-wrong-credentials-post-form');
	});
});

test.describe('typed early', () => {
	test('Values typed before hydration survive and are used', async ({ page }) => {
		// Hold the app's JS so hydration is delayed while the user types.
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		await page.route('**/_app/immutable/entry/*.js', async (route) => {
			await gate;
			await route.continue();
		});
		await page.goto('/signin', { waitUntil: 'domcontentloaded' });
		await page.getByTitle('Email').fill(need('QA_TENANT_EMAIL'));
		await page.getByTitle('Password').fill(need('QA_TENANT_PASSWORD'));
		release();
		await page.locator('html[data-hydrated]').waitFor({ timeout: 20000 });
		await expect(page.getByTitle('Email')).toHaveValue(need('QA_TENANT_EMAIL'));
		await expect((await page.getByTitle('Password').inputValue()).length).toBeGreaterThan(0);
		await shot(page, 'authentication-typed-early'); // fields are not credentials-masked? password is masked; email is a QA account
	});
});

test.describe('route protection', () => {
	test('Unauthenticated page request redirects 303 to /signin', async ({ request }) => {
		const r = await request.get('/', { maxRedirects: 0 });
		expect(r.status()).toBe(303);
		expect(r.headers()['location']).toMatch(/\/signin$/);
	});
	test('API requests are not redirected', async ({ request }) => {
		const r = await request.get('/api/signin', { maxRedirects: 0 });
		expect([301, 302, 303, 307, 308]).not.toContain(r.status());
	});
	test('Forgot password page is public', async ({ page, request }) => {
		const r = await request.get('/forgot', { maxRedirects: 0 });
		expect(r.status()).toBe(200);
		await page.goto('/forgot');
		await expect(page).toHaveURL(/\/forgot$/);
		await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
		await shot(page, 'authentication-forgot-password-page-is-public');
	});
});

test.describe('password reset request', () => {
	test('Unknown email via API returns email_sent', async ({ request }) => {
		const r = await request.put('/api/signin/reset', { data: { email: unknown('api-unknown') } });
		expect(r.status()).toBe(200);
		expect(await r.json()).toEqual({ status: 'email_sent' });
	});

	test('Second request within a minute gets same answer (unknown address)', async ({ request }) => {
		const e = unknown('twice');
		const a = await request.put('/api/signin/reset', { data: { email: e } });
		const b = await request.put('/api/signin/reset', { data: { email: e.toUpperCase() } });
		expect([a.status(), b.status()]).toEqual([200, 200]);
		expect(await a.json()).toEqual(await b.json());
	});

	test('Sixth request within an hour gets same answer', async ({ request }) => {
		const e = unknown('six');
		const out: unknown[] = [];
		for (let i = 0; i < 6; i++) {
			const r = await request.put('/api/signin/reset', { data: { email: e } });
			expect(r.status()).toBe(200);
			out.push(await r.json());
		}
		expect(new Set(out.map((o) => JSON.stringify(o))).size).toBe(1);
	});

	test('Variants of one mailbox get same answer', async ({ request }) => {
		const a = await request.put('/api/signin/reset', { data: { email: `qa-v+one-${runId}@example.com` } });
		const b = await request.put('/api/signin/reset', { data: { email: `qa-v+two-${runId}@example.com` } });
		expect(await a.json()).toEqual(await b.json());
	});
});

test.describe('forgot page', () => {
	test('Request from the sign-in page + Same answer for unknown emails', async ({ page }) => {
		await page.goto('/signin');
		await page.getByRole('link', { name: 'Forgot password?' }).click();
		await expect(page).toHaveURL(/\/forgot$/);
		await page.getByTitle('Email').fill(unknown('forgot'));
		await page.getByRole('button', { name: 'Send reset link' }).click();
		await expect(page.getByText(MSG.sent)).toBeVisible({ timeout: 15000 });
		await shot(page, 'forgot-request-from-the-sign-in-page');
	});

	test.describe('without JavaScript', () => {
		test.use({ javaScriptEnabled: false });
		test('Works without scripts', async ({ page }) => {
			await page.goto('/forgot');
			await page.getByTitle('Email').fill(unknown('nojs'));
			await page.getByRole('button', { name: 'Send reset link' }).click();
			await expect(page.getByText(MSG.sent)).toBeVisible({ timeout: 15000 });
			await shot(page, 'forgot-same-answer-for-unknown-emails-no-js');
		});
		test('Invalid email without scripts asks for a valid email', async ({ page, request }) => {
			// Bypass browser validation by posting directly.
			const r = await request.post('/forgot', {
				form: { email: 'not-an-email' },
				headers: { origin: 'https://lehman-realty-dev.web.app' }
			});
			const body = await r.text();
			expect(body).not.toContain(MSG.sent);
			expect(body.toLowerCase()).toContain('valid email');
			const r2 = await request.post('/forgot', {
				form: { email: '' },
				headers: { origin: 'https://lehman-realty-dev.web.app' }
			});
			const b2 = await r2.text();
			expect(b2).not.toContain(MSG.sent);
			expect(b2.toLowerCase()).toContain('valid email');
			await page.setContent('<p>see assertions</p>');
		});
	});

	test('Empty or invalid email (browser, validation bypassed)', async ({ page }) => {
		await page.goto('/forgot');
		await page.locator('form').evaluate((f: HTMLFormElement) => (f.noValidate = true));
		await page.getByTitle('Email').fill('not-an-email');
		await page.getByRole('button', { name: 'Send reset link' }).click();
		await expect(page.getByText(/valid email/i)).toBeVisible({ timeout: 15000 });
		await expect(page.getByText(MSG.sent)).toHaveCount(0);
		await shot(page, 'forgot-empty-or-invalid-email');
	});

	test('Delivery failure (not automatable) is documented elsewhere', async () => {
		test.skip(true, 'needs an existing account whose email send fails');
	});
});

test.describe('password reset completion', () => {
	test('Wrong mode returns 400 Invalid action', async ({ page, request }) => {
		const r = await request.get('/reset?mode=verifyEmail&oobCode=abc');
		expect(r.status()).toBe(400);
		const res = await page.goto('/reset?mode=verifyEmail&oobCode=abc');
		expect(res!.status()).toBe(400);
		await expect(page.getByText('Invalid action')).toBeVisible();
		await expect(page.getByTitle('New Password')).toHaveCount(0);
		await shot(page, 'authentication-wrong-mode');
	});
	test('Missing code returns 400 Invalid action', async ({ page }) => {
		const res = await page.goto('/reset?mode=resetPassword');
		expect(res!.status()).toBe(400);
		await expect(page.getByText('Invalid action')).toBeVisible();
		await expect(page.getByTitle('New Password')).toHaveCount(0);
		await shot(page, 'authentication-missing-code');
	});
	test('Continue destination /signin shows password-changed notice', async ({ page }) => {
		await page.goto('/signin?reset=success');
		await expect(page.getByText(MSG.changed)).toBeVisible();
		await shot(page, 'authentication-continue-after-a-reset-signin-notice');
		await page.goto('/signin');
		await expect(page.getByText(MSG.changed)).toHaveCount(0);
	});
	test('Valid link with fake code shows form, bad code gives error toast (partial)', async ({ page }) => {
		await page.goto('/reset?mode=resetPassword&oobCode=qa-fake&continueUrl=https%3A%2F%2Fexample.com');
		await expect(page.getByTitle('New Password')).toBeVisible();
		await page.getByTitle('New Password').fill('Qa-Fake-Pass1!');
		await page.getByTitle('Verify Password').fill('Qa-Fake-Pass1!');
		await page.locator('html[data-hydrated]').waitFor({ timeout: 15000 }).catch(() => undefined);
		await page.getByRole('button', { name: 'Change Password' }).click();
		await expect(page.getByText(/Error resetting password/)).toBeVisible({ timeout: 15000 });
		await expect(page).toHaveURL(/\/reset/);
		await shot(page, 'authentication-reset-fake-code-error');
	});
});
