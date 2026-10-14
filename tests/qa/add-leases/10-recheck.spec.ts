import { test, expect } from '@playwright/test';
import {
	email,
	createProperty,
	fillLease,
	leaseItems,
	openLeasesTab,
	PDF,
	ready,
	saveLease,
	shot,
	newSession,
	leaseIdsAt,
	deleteUserByEmail,
	RUN
} from './helpers';

test.setTimeout(170_000);

test('recheck: replace a lease document, Add User attempt, then clean up', async ({ browser }) => {
	const { ctx, page } = await newSession(browser, 'admin');
	const propC = await createProperty(page, `qa-Property C ${RUN}`, '800', '303 QA Gamma St');
	await page.goto(`/admin/properties/${propC}/leases/new`);
	await ready(page);
	await fillLease(page, { startDate: '2026-01-01', endDate: '2026-03-31', emails: [email('c1')] });
	await page
		.locator('input[name=document]')
		.setInputFiles({ name: 'qa-lease-c1.pdf', mimeType: 'application/pdf', buffer: PDF });
	await saveLease(page);
	await page.waitForTimeout(5000);
	const [leaseC] = await leaseIdsAt(page, propC);
	await page.goto(`/admin/properties/${propC}/leases/${leaseC}`);
	await ready(page);
	await expect(page.getByText('Current: qa-lease-c1.pdf')).toBeVisible();
	await page
		.locator('input[name=document]')
		.setInputFiles({
			name: 'qa-lease-c1-v2.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.concat([PDF, Buffer.from('v2')])
		});
	await saveLease(page);
	await expect(page)
		.toHaveURL(/tab=leases|leases\/new/, { timeout: 30000 })
		.catch(() => {});
	await page.waitForTimeout(6000);
	console.log('after replace save url', page.url());
	await page.goto(`/admin/properties/${propC}/leases/${leaseC}`);
	await ready(page);
	const cur = await page
		.getByText(/^Current: /)
		.first()
		.innerText()
		.catch(() => 'none');
	console.log('DOCUMENT NAME AFTER REPLACE:', cur);
	await shot(page, 'leases-document-replace');
	expect(cur).toContain('qa-lease-c1-v2.pdf');
	// Add User: a few attempts to measure the 500 rate on /admin/users too
	let statuses: number[] = [];
	for (let i = 0; i < 6; i++) {
		const r = await page.goto('/admin/users');
		statuses.push(r?.status() ?? 0);
	}
	console.log('USERS PAGE STATUSES', statuses);
	await page.goto('/admin/users');
	await ready(page);
	await page.getByRole('button', { name: 'Add User' }).click();
	await page.getByRole('dialog').locator('input').fill(email('u1'));
	await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
	await page.waitForTimeout(3500);
	console.log(
		'ADD USER toast:',
		(await page.locator('[role=status], [role=alert]').allInnerTexts())
			.join(' | ')
			.replace(/\S+@\S+/g, '<e>')
	);
	await shot(page, 'user-management-admin-add-user');
	// clean up
	await page.goto(`/admin/properties/${propC}/leases/${leaseC}`);
	await ready(page);
	await page.getByRole('button', { name: 'Delete lease' }).click();
	await page.getByRole('button', { name: 'Confirm' }).click();
	await expect(page).toHaveURL(/tab=leases/, { timeout: 20000 });
	for (const tag of ['c1', 'u1'])
		console.log(
			'user',
			tag,
			(await deleteUserByEmail(page, email(tag))) ? 'deleted' : 'not present'
		);
	await page.goto('/admin/properties');
	await ready(page);
	await page.getByRole('button', { name: /^Actions for qa-Property C/ }).click();
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	await page.getByRole('button', { name: 'Confirm' }).click();
	await page.waitForTimeout(4000);
	await page.goto('/admin/properties');
	await ready(page);
	await expect(page.getByText(/qa-Property/)).toHaveCount(0);
	await ctx.close();
});
