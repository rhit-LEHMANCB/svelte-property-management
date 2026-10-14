import { test, expect } from '@playwright/test';
import { newSession, ready, shot } from './helpers';
test('cleanup check: no qa- users or properties remain', async ({ browser }) => {
	const { ctx, page } = await newSession(browser, 'admin');
	await page.goto('/admin/users');
	await ready(page);
	await expect(page.getByText(/qa-[a-z0-9]+-[a-z0-9]+@example\.com|resend\.dev/)).toHaveCount(0);
	await shot(page, 'cleanup-final-users');
	await page.goto('/admin/properties');
	await ready(page);
	await expect(page.getByText(/qa-Property/)).toHaveCount(0);
	await shot(page, 'cleanup-final-properties');
	await ctx.close();
});
