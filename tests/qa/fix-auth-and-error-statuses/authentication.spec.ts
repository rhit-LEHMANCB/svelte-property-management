import { expect, test } from '@playwright/test';
import { shot, signInAs } from './support';

test('authentication: Malformed ID token', async ({ page, request }) => {
	const r = await request.post('/api/signin', { data: { idToken: 'not-a-token' } });
	const body = await r.text();
	console.log(
		'signin status',
		r.status(),
		'body',
		body,
		'set-cookie',
		r.headers()['set-cookie'] ?? '(none)'
	);
	expect(r.status()).toBe(401);
	expect(body).toContain('Invalid ID token');
	expect(r.headers()['set-cookie'] ?? '').not.toContain('__session');
	// Render the result for evidence.
	await page.setContent(
		`<body style="font:16px sans-serif;padding:24px"><h2>POST /api/signin {"idToken":"not-a-token"}</h2><p>Status: <b>${r.status()}</b></p><p>Body: <code>${body.replace(/</g, '&lt;')}</code></p><p>Set-Cookie header: <b>${r.headers()['set-cookie'] ? 'present' : 'none'}</b></p></body>`
	);
	await shot(page, 'authentication-malformed-id-token');
});

test('authentication: valid sign-in still works (admin)', async ({ page }) => {
	await signInAs(page, 'admin');
	await page.waitForLoadState('networkidle');
	await expect(page).not.toHaveURL(/\/signin/);
	const cookies = (await page.context().cookies()).map((c) => c.name);
	expect(cookies).toContain('__session');
	await shot(page, 'authentication-valid-signin-admin');
});

test('authentication: other bad /api/signin bodies (observation only)', async ({ request }) => {
	for (const data of [{ idToken: '' }, {}, { idToken: 'a.b.c' }, { idToken: 123 }]) {
		const r = await request.post('/api/signin', { data });
		console.log('variant', JSON.stringify(data), r.status(), await r.text());
		// Not in the delta spec: record the status, only the cookie is asserted.
		expect(r.headers()['set-cookie'] ?? '').not.toContain('__session');
	}
});

test('authentication: Password reset page form behavior', async ({ page, browser, baseURL }) => {
	await page.goto('/reset?mode=resetPassword&oobCode=qa-anything');
	await page.waitForLoadState('networkidle');
	const btn = page.getByRole('button', { name: 'Change Password' });
	await expect(btn).toBeVisible();
	await expect(btn).toHaveAttribute('type', 'submit');
	expect(
		await btn.evaluate(
			(b) => !!b.closest('form') && (b as HTMLButtonElement).form === b.closest('form')
		)
	).toBe(true);

	const pw = page.locator('input[name="newPassword"]');
	const verify = page.locator('input[name="verifyPassword"]');
	await pw.fill('QaTyped#Pass123');
	await verify.fill('QaOther#Pass456');
	await verify.press('Enter');
	await expect(page.getByText('Passwords must match')).toBeVisible();
	const url = page.url();
	expect(url).not.toContain('QaTyped');
	expect(url).not.toContain('QaOther');
	expect(url).not.toContain('newPassword');
	await shot(page, 'authentication-password-reset-page-form-behavior');

	// Enter in the first field too.
	await pw.press('Enter');
	await expect(page.getByText('Passwords must match')).toBeVisible();
	expect(page.url()).not.toContain('QaTyped');

	// JavaScript disabled.
	const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
	const p2 = await ctx.newPage();
	await p2.goto('/reset?mode=resetPassword&oobCode=qa-anything');
	await p2.locator('input[name="newPassword"]').fill('QaTyped#Pass123');
	await p2.locator('input[name="verifyPassword"]').fill('QaOther#Pass456');
	await p2.locator('input[name="verifyPassword"]').press('Enter');
	await p2.waitForLoadState('load');
	console.log(
		'nojs url path',
		new URL(p2.url()).pathname,
		'search has pw:',
		/Qa(Typed|Other)|newPassword/.test(p2.url())
	);
	expect(p2.url()).not.toMatch(/QaTyped|QaOther|newPassword|verifyPassword/);
	await shot(p2, 'authentication-password-reset-no-javascript');
	await ctx.close();
});

test('authentication: reset page bad modes still 400', async ({ request }) => {
	const a = await request.get('/reset?mode=verifyEmail&oobCode=abc');
	const b = await request.get('/reset?mode=resetPassword');
	console.log('verifyEmail', a.status(), 'no oobCode', b.status());
	expect(a.status()).toBe(400);
	expect(b.status()).toBe(400);
});
