import { expect, test } from '@playwright/test';
import { shot, signInAs } from './support';

const common = ['/', '/payment', '/maintenance', '/insurance', '/profile'];
const adminOnly = ['/admin', '/admin/properties', '/admin/users', '/admin/maintenance'];

for (const role of ['admin', 'tenant'] as const) {
	test(`regression: ${role} top-level pages load`, async ({ page }) => {
		await signInAs(page, role);
		const pages = role === 'admin' ? [...common, ...adminOnly] : common;
		for (const p of pages) {
			const r = await page.goto(p);
			await page.waitForLoadState('networkidle');
			console.log(role, p, r!.status());
			expect(r!.status(), p).toBe(200);
		}
		if (role === 'admin') {
			await page.goto('/admin/properties');
			await page.waitForLoadState('networkidle');
		}
		await shot(page, `regression-${role}`);
		if (role === 'tenant') {
			const r = await page.goto('/admin');
			console.log('tenant /admin', r!.status());
			expect(r!.status()).not.toBe(200);
		}
	});
}
