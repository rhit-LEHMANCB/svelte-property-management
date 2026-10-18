import { test, expect } from '@playwright/test';
import { QA_PROPERTY_TITLE, go, signInAs } from './support';

// Removes every property this QA run created (all titled qa-ui-consistency-...).
test('cleanup: remove qa-ui-consistency properties', async ({ page }) => {
	await signInAs(page, 'admin');
	for (let i = 0; i < 6; i++) {
		await go(page, '/admin/properties');
		const link = page
			.locator('a[href*="/edit"]', { hasText: QA_PROPERTY_TITLE.slice(0, 20) })
			.first();
		if (!(await link.count())) break;
		const id = (await link.getAttribute('href'))!.match(/properties\/([^/]+)\/edit/)![1];
		const r = await page.request.delete(`/api/property/${id}`);
		console.log('deleted', id, r.status());
		expect(r.ok()).toBe(true);
	}
	await go(page, '/admin/properties');
	await expect(page.locator('a[href*="/edit"]', { hasText: 'qa-ui-consistency' })).toHaveCount(0);
});
