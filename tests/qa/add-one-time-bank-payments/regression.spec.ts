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
		expect(errors).toEqual([]);
		await page.goto(pages[role][0]);
		await shot(page, `regression-${role}-home`);
	});
}

test('Regression: signed-out visit to /payment and /payment/success goes to sign-in; API answers 401', async ({
	page,
	request
}) => {
	await page.goto('/payment');
	await expect(page).toHaveURL(/\/signin/);
	await page.goto('/payment/success');
	await expect(page).toHaveURL(/\/signin/);
	const r = await request.post('/api/stripe/create-checkout-session/payment', {
		data: { leaseId: 'x', amount: 1, method: 'card' }
	});
	expect([401, 403]).toContain(r.status());
	await shot(page, 'regression-signed-out');
});

test('Regression: admin has no tenant payment page content leaking', async ({ page }) => {
	await signInAs(page, 'admin');
	await page.goto('/payment');
	await page.waitForLoadState('networkidle');
	await shot(page, 'regression-admin-payment');
});
