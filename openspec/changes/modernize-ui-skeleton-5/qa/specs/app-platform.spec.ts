import { expect, test, type Browser, type Page } from '@playwright/test';
import { shot, signIn } from './helpers';
import { qaPropertyUrl, waitReady } from './data';

const ADMIN_ENTRIES = ['Home', 'Profile', 'Maintenance', 'Properties', 'Users'];
const TENANT_ENTRIES = ['Dashboard', 'Maintenance', 'Payment', 'Profile', 'Insurance', 'About Us'];

async function signedIn(browser: Browser, role: 'admin' | 'tenant', viewport = { width: 1280, height: 800 }) {
	const ctx = await browser.newContext({ viewport });
	const page = await ctx.newPage();
	await signIn(page, role);
	await waitReady(page);
	return { ctx, page };
}

const navTexts = (page: Page) => page.locator('aside nav[aria-label="Main"] a').allInnerTexts().then((t) => t.map((s) => s.trim()));

test('Role-based navigation', async ({ browser }) => {
	test.setTimeout(120000);
	const a = await signedIn(browser, 'admin');
	expect(new URL(a.page.url()).pathname).toBe('/admin');
	// access-control spec: admins see Home, Maintenance, Properties, Users and Profile
	expect(await navTexts(a.page)).toEqual(ADMIN_ENTRIES);
	await shot(a.page, 'app-platform-role-based-navigation-admin');
	// tenant-only pages are not offered, and typed URLs go back to the admin home
	await a.page.goto('/payment');
	await expect(a.page).toHaveURL(/\/admin$/);
	await a.ctx.close();

	const t = await signedIn(browser, 'tenant');
	expect(new URL(t.page.url()).pathname).toBe('/');
	// tenants see Dashboard, Maintenance, Payment, Profile, Insurance and About Us
	expect(await navTexts(t.page)).toEqual(TENANT_ENTRIES);
	await shot(t.page, 'app-platform-role-based-navigation');
	await t.ctx.close();
});

test('Small screens', async ({ browser }) => {
	test.setTimeout(180000);
	for (const role of ['admin', 'tenant'] as const) {
		const { ctx, page } = await signedIn(browser, role, { width: 390, height: 844 });
		const urls =
			role === 'admin'
				? ['/admin', '/admin/properties', '/admin/users', '/admin/maintenance', '/profile', '/admin/properties/add', await qaPropertyUrl(page)]
				: ['/', '/maintenance', '/payment', '/insurance', '/profile'];
		for (const url of urls) {
			await page.goto(url);
			await waitReady(page);
			const wide = await page.evaluate(() => {
				const main = document.querySelector('main');
				return {
					doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
					body: document.body.scrollWidth - document.body.clientWidth,
					main: main ? main.scrollWidth - main.clientWidth : 0
				};
			});
			expect(wide, `${role} ${url} horizontal overflow`).toEqual({ doc: 0, body: 0, main: 0 });
		}
		// the sidebar is hidden at phone width, the navigation is reachable from the menu button
		await expect(page.locator('aside nav[aria-label="Main"]')).toBeHidden();
		await page.locator('button[aria-label="Open menu"]').click();
		const drawer = page.locator('[role="dialog"][data-state="open"]');
		await expect(drawer).toBeVisible();
		const links = (await drawer.locator('nav[aria-label="Main"] a').allInnerTexts()).map((s) => s.trim());
		expect(links).toEqual(role === 'admin' ? ADMIN_ENTRIES : TENANT_ENTRIES);
		await expect(drawer.getByRole('button', { name: 'Sign out' })).toBeVisible();
		if (role === 'tenant') await shot(page, 'app-platform-small-screens');
		await page.keyboard.press('Escape');
		await ctx.close();
	}
});

test('Current page is indicated', async ({ browser }) => {
	test.setTimeout(180000);
	const checks: Record<'admin' | 'tenant', [string, string][]> = {
		admin: [
			['/admin', 'Home'],
			['/profile', 'Profile'],
			['/admin/maintenance', 'Maintenance'],
			['/admin/properties', 'Properties'],
			['/admin/users', 'Users']
		],
		tenant: [
			['/', 'Dashboard'],
			['/maintenance', 'Maintenance'],
			['/payment', 'Payment'],
			['/profile', 'Profile'],
			['/insurance', 'Insurance']
		]
	};
	for (const role of ['admin', 'tenant'] as const) {
		const { ctx, page } = await signedIn(browser, role);
		const list = checks[role];
		if (role === 'admin') list.push([await qaPropertyUrl(page), 'Properties']);
		for (const [url, entry] of list) {
			await page.goto(url);
			await waitReady(page);
			const current = page.locator('aside nav[aria-label="Main"] a[aria-current="page"]');
			await expect(current, `${role} ${url}`).toHaveCount(1);
			await expect(current).toHaveText(entry);
			// visibly marked: its background differs from every other entry and it is not just a colour
			// of text; compare with the first other entry
			const styles = await page.evaluate(() => {
				const all = Array.from(document.querySelectorAll('aside nav[aria-label="Main"] a'));
				const bg = (el: Element) => getComputedStyle(el).backgroundColor;
				const cur = all.find((a) => a.getAttribute('aria-current') === 'page')!;
				return { cur: bg(cur), others: all.filter((a) => a !== cur).map(bg) };
			});
			for (const o of styles.others) expect(o).not.toBe(styles.cur);
		}
		if (role === 'admin') {
			await page.goto('/admin/users');
			await waitReady(page);
			await shot(page, 'app-platform-current-page-is-indicated');
		}
		await ctx.close();
	}
});
