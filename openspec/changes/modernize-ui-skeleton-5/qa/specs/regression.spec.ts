import { expect, test, type Page } from '@playwright/test';
import { shot, signIn } from './helpers';
import { qaPropertyUrl, waitReady } from './data';

// Short regression pass: sign in as each role, load each top-level page, and watch for errors.
function watch(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
	page.on('console', (m) => {
		if (m.type() !== 'error') return;
		const text = m.text();
		// Firebase Storage images are blocked by this sandbox's network (ERR_BLOCKED_BY_ORB), not by the app
		if (/ERR_BLOCKED_BY_ORB|Failed to load resource/.test(text)) return;
		errors.push(`console.error: ${text.slice(0, 160)}`);
	});
	return errors;
}

test('Regression: admin signs in and every top-level page loads', async ({ browser }) => {
	test.setTimeout(180000);
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	const errors = watch(page);
	await signIn(page, 'admin');
	await waitReady(page);
	expect(new URL(page.url()).pathname).toBe('/admin');
	const pages: [string, string][] = [
		['/admin', 'Admin home'],
		['/admin/properties', 'Properties'],
		['/admin/properties/add', 'New Property'],
		[await qaPropertyUrl(page), 'QA-Upper-Prop'],
		['/admin/users', 'Users'],
		['/admin/maintenance', 'Maintenance'],
		['/profile', 'Profile']
	];
	for (const [url, h1] of pages) {
		const res = await page.goto(url);
		expect(res?.status(), url).toBeLessThan(400);
		await waitReady(page);
		await expect(page.getByRole('heading', { level: 1 }), url).toHaveText(h1);
		await expect(page.locator('header, [role="banner"]').first()).toContainText('Lehman Family LLC');
	}
	// each navigation entry works by clicking
	for (const entry of ['Maintenance', 'Properties', 'Users', 'Profile', 'Home']) {
		await page.locator('aside nav[aria-label="Main"]').getByRole('link', { name: entry }).click();
		await waitReady(page);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	}
	await shot(page, 'regression-admin-home');
	// sign out returns to the sign-in page
	await page.getByRole('button', { name: 'Sign out' }).click();
	await page.waitForURL(/\/signin/);
	expect(errors).toEqual([]);
	await ctx.close();
});

test('Regression: tenant signs in and every top-level page loads', async ({ browser }) => {
	test.setTimeout(180000);
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	const errors = watch(page);
	await signIn(page, 'tenant');
	await waitReady(page);
	expect(new URL(page.url()).pathname).toBe('/');
	const pages: [string, RegExp][] = [
		['/', /Dashboard|Welcome|Lehman|Property|Rent/i],
		['/maintenance', /Maintenance/],
		['/payment', /Payment/],
		['/insurance', /Insurance/],
		['/profile', /Profile/]
	];
	for (const [url, h1] of pages) {
		const res = await page.goto(url);
		expect(res?.status(), url).toBeLessThan(400);
		await waitReady(page);
		await expect(page.getByRole('heading', { level: 1 }), url).toHaveText(h1);
		expect(new URL(page.url()).pathname, `${url} did not redirect`).toBe(url);
	}
	await shot(page, 'regression-tenant-dashboard');
	// a tenant is kept out of the admin pages
	const denied = await page.goto('/admin/users');
	expect(denied?.status()).toBe(401);
	await expect(page.getByText('You must be an admin to do this.')).toBeVisible();
	expect(errors).toEqual([]);
	await ctx.close();
});
