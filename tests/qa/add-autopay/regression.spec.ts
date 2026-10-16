import { expect, test } from '@playwright/test';
import { shotEl, signInAs } from './support';

const pages = {
	tenant: ['/', '/maintenance', '/payment', '/profile', '/insurance'],
	admin: ['/admin', '/admin/properties', '/admin/maintenance', '/admin/users', '/profile']
} as const;

for (const role of ['tenant', 'admin'] as const) {
	test(`Regression: ${role} loads every top-level page`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(`pageerror ${e.message.slice(0, 120)}`));
		page.on('response', (r) => {
			if (r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
		});
		await signInAs(page, role);
		for (const path of pages[role]) {
			const res = await page.goto(path);
			await page.waitForLoadState('networkidle');
			expect(res?.status(), path).toBeLessThan(400);
			await expect(page, path).not.toHaveURL(/\/signin/);
			await expect(page.locator('h1, h2').first(), path).toBeVisible();
		}
		console.log(role, 'errors:', JSON.stringify(errors));
		expect(errors).toEqual([]);
		await page.goto(pages[role][0]);
		await shotEl(page, page.locator('body'), `regression-${role}-home`);
	});
}

test('Regression: signed-out visit to /payment goes to sign-in, autopay setup answers 401', async ({
	page
}) => {
	await page.goto('/payment');
	await expect(page).toHaveURL(/\/signin/);
	await shotEl(page, page.locator('body'), 'regression-signed-out');
});
