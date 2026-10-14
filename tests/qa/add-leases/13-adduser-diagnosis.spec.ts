import { test, expect } from '@playwright/test';
import { newSession, ready, shot, deleteUserByEmail, RUN, email } from './helpers';

test.setTimeout(150_000);

/** Diagnoses "Error creating user." on /admin/users and the page's own HTTP status over repeated loads. */
test('user-management: Add User response, and /admin/users status over repeated loads', async ({ browser }) => {
	const { ctx, page } = await newSession(browser, 'admin');
	const statuses: number[] = [];
	for (let i = 0; i < 10; i++) statuses.push((await page.goto('/admin/users'))?.status() ?? 0);
	console.log('ADMIN USERS STATUSES', statuses.join(','));
	expect(statuses.every((s) => s < 400), `statuses ${statuses}`).toBe(true);
	// Resend's documented sandbox recipient accepts mail without delivering it.
	const sandbox = `delivered+qa-${RUN}@resend.dev`;
	for (const address of [email('u2'), sandbox]) {
		await page.goto('/admin/users');
		await ready(page);
		const post = page.waitForResponse((r) => r.url().includes('/api/user/add') && r.request().method() === 'POST');
		await page.getByRole('button', { name: 'Add User' }).click();
		await page.getByRole('dialog').locator('input').fill(address);
		await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
		const r = await post;
		console.log('ADD USER', address.includes('resend.dev') ? 'sandbox' : 'example.com', r.status(), (await r.text()).slice(0, 200).replace(/\S+@\S+/g, '<e>'));
		await page.waitForTimeout(1500);
	}
	await shot(page, 'user-management-admin-add-user-diagnosis');
	for (const address of [email('u2'), sandbox]) console.log('cleanup', await deleteUserByEmail(page, address));
	await ctx.close();
});
