import { expect, test } from '@playwright/test';
import { shot, signInAs } from './support';

const pages = {
	tenant: ['/', '/maintenance', '/payment', '/profile', '/insurance'],
	admin: ['/admin', '/admin/properties', '/admin/maintenance', '/admin/users', '/profile']
} as const;

for (const role of ['tenant', 'admin'] as const) {
	test(`Regression: ${role} loads every top-level page`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(`pageerror ${e.message.slice(0, 120)}`));
		page.on('console', (m) => {
			if (m.type() === 'error') errors.push(`console ${m.text().slice(0, 120)}`);
		});
		page.on('response', (r) => {
			if (r.status() >= 400) errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
		});
		await signInAs(page, role);
		for (const path of pages[role]) {
			const res = await page.goto(path);
			await page.waitForLoadState('networkidle');
			expect(res?.status(), path).toBeLessThan(400);
			await expect(page, path).not.toHaveURL(/\/signin/);
			await expect(page.locator('h1, h2').first(), path).toBeVisible();
		}
		console.log(`${role} errors:`, JSON.stringify(errors));
		await page.goto(role === 'admin' ? '/admin/properties' : '/payment');
		await page.waitForLoadState('networkidle');
		await shot(page, `regression-${role}-top-level-pages`);
		expect(errors.filter((e) => /^(pageerror|5\d\d)/.test(e))).toEqual([]);
	});
}
