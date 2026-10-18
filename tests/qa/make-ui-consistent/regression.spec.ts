import { test } from '@playwright/test';
import { expect, go, shot, signInAs } from './support';

test.use({ viewport: { width: 1280, height: 900 } });

const watch = (page: import('@playwright/test').Page, sink: string[]) => {
	page.on('pageerror', (e) => sink.push('pageerror: ' + e.message.slice(0, 160)));
	page.on('console', (m) => {
		if (m.type() === 'error')
			sink.push(
				'console: ' +
					m
						.text()
						.slice(0, 160)
						.replace(/\S+@\S+/g, '<email>')
			);
	});
	page.on('response', (r) => {
		if (r.status() >= 500) sink.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
	});
};

for (const [who, urls] of [
	[
		'admin',
		[
			'/',
			'/admin',
			'/admin/users',
			'/admin/properties',
			'/admin/maintenance',
			'/profile',
			'/admin/properties/add'
		]
	],
	['tenant', ['/', '/payment', '/maintenance', '/insurance', '/profile']]
] as const) {
	test(`Regression: ${who} loads every top-level page without errors`, async ({ page }) => {
		const errors: string[] = [];
		watch(page, errors);
		await signInAs(page, who);
		for (const url of urls) {
			const resp = await page.goto(url);
			await page.waitForLoadState('networkidle');
			expect.soft(resp?.status(), url).toBeLessThan(400);
			await expect.soft(page.getByRole('heading', { level: 1 }).first(), url).toBeVisible();
			expect.soft(await page.locator('[data-page-body]').count(), `${url} page body`).toBe(1);
			await shot(
				page,
				`regression-${who}-${url === '/' ? 'home' : url.slice(1).replace(/\//g, '-')}`
			);
		}
		console.log(`REGRESSION-${who} errors:`, JSON.stringify(errors));
		expect
			.soft(errors.filter((e) => !/favicon|Failed to load resource.*(401|404)/.test(e)))
			.toEqual([]);
		// Signed-in user is sent away from /signin; sign out works.
		await page
			.getByRole('button', { name: /Sign out/ })
			.first()
			.click();
		await expect(page).toHaveURL(/\/signin/);
	});
}

test('Regression: signed-out visit to a signed-in page redirects to /signin', async ({ page }) => {
	await page.goto('/profile');
	await expect(page).toHaveURL(/\/signin/);
});
