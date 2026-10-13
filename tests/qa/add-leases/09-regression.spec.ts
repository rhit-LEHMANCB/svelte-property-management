import { test, expect } from '@playwright/test';
import { ready, shot, newSession, ADMIN } from './helpers';

test.setTimeout(150_000);

const adminPages = [
	'/',
	'/profile',
	'/admin/maintenance',
	'/admin/properties',
	'/admin/users',
	'/admin/properties/add'
];
const tenantPages = ['/', '/payment', '/maintenance', '/profile', '/insurance'];
const slug = (p: string) => (p === '/' ? 'home' : p.slice(1).replace(/\//g, '-'));

for (const [who, pages] of [
	['admin', adminPages],
	['tenant', tenantPages]
] as const) {
	test(`regression: ${who} loads every top-level page`, async ({ browser }) => {
		const { ctx, page } = await newSession(browser, who);
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(`pageerror ${e.message.slice(0, 120)}`));
		page.on('console', (m) => {
			if (m.type() === 'error')
				errors.push(`console ${m.text().slice(0, 140)} @ ${m.location().url.slice(0, 80)}`);
		});
		page.on('response', (r) => {
			if (r.status() >= 400 && r.url().includes('lehman-realty-dev.web.app'))
				errors.push(
					`http ${r.status()} ${r
						.url()
						.replace(/[?#].*/, '')
						.slice(0, 100)}`
				);
		});
		for (const p of pages) {
			const res = await page.goto(p);
			await ready(page);
			console.log(
				who.toUpperCase(),
				p,
				res?.status(),
				page.url().replace('https://lehman-realty-dev.web.app', '')
			);
			expect(res?.status()).toBeLessThan(400);
			await expect(page.getByText('Lehman Family LLC').first()).toBeVisible();
			await shot(page, `regression-${who}-${slug(p)}`);
		}
		console.log(who.toUpperCase(), 'errors seen:', JSON.stringify([...new Set(errors)]));
		await ctx.close();
	});
}

test('regression: signed-out visitor is sent to sign-in, bad password is refused, sign-out works', async ({
	browser
}) => {
	const ctx = await browser.newContext({ baseURL: 'https://lehman-realty-dev.web.app' });
	const page = await ctx.newPage();
	await page.goto('/');
	await ready(page);
	await expect(page).toHaveURL(/\/signin/);
	await page.getByLabel('Email').fill(ADMIN.email);
	await page.getByLabel('Password').fill('qa-wrong-password-1');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForTimeout(2500);
	await expect(page).toHaveURL(/\/signin/);
	await shot(page, 'regression-signin-bad-password-refused');
	await ctx.close();
	const { ctx: c2, page: p2 } = await newSession(browser, 'tenant');
	await p2
		.getByRole('button', { name: /Sign out/ })
		.first()
		.click();
	await expect(p2).toHaveURL(/\/signin/, { timeout: 20000 });
	await shot(p2, 'regression-sign-out');
	await c2.close();
});

test('data-migrations: the QA tenant existing lease appears as a lease (read only)', async ({
	browser
}) => {
	const { ctx, page } = await newSession(browser, 'admin');
	await page.goto('/admin/properties');
	await ready(page);
	const link = page.getByRole('link', { name: 'boom' }).first();
	const href = await link.getAttribute('href');
	page.setDefaultTimeout(15000);
	const res = await page.goto(`${href}?tab=leases`);
	await ready(page);
	console.log('EXISTING PROPERTY edit page status:', res?.status());
	await shot(page, 'data-migrations-existing-tenant-link-appears-as-a-lease');
	expect(res?.status(), 'admin opens the existing property Leases tab').toBeLessThan(400);
	const items = page.getByRole('list', { name: 'Leases' }).locator(':scope > li');
	console.log(
		'EXISTING PROPERTY leases:',
		(await items.allInnerTexts()).map((t) => t.replace(/\n+/g, ' ').replace(/\S+@\S+/g, '<e>'))
	);
	await expect(items.first()).toContainText('month to month');
	await shot(page, 'data-migrations-existing-tenant-link-appears-as-a-lease');
	await ctx.close();
});
