import { expect, test } from '@playwright/test';
import { shot, signIn } from './helpers';
import { QA_PROP, QA_USER_EMAIL, ensureQaProperty, ensureQaTenantAssigned, ensureQaUser, linkQaTenantAccount, waitReady } from './data';

test.describe.configure({ mode: 'serial' });

// Runs last. Everything removed here was created by these QA specs (names and emails start with "qa-").
test('Pagination of lists keeps working: page is kept when a row action refreshes the data (also removes the qa- user)', async ({
	browser
}) => {
	test.setTimeout(180000);
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	await signIn(page, 'admin');
	// make sure the qa- data exists (an earlier partial run may have removed it), then unlink the qa- user
	// and the QA tenant account from the qa- property
	await ensureQaProperty(page);
	await ensureQaUser(page);
	const url = await ensureQaTenantAssigned(page); // makes sure the qa- user exists and is linked
	const id = url.split('/')[3];
	await linkQaTenantAccount(page, false);
	const unlink = await page.request.delete(`/api/property/${id}/tenants`, {
		data: { tenantId: await qaUserIdFor(page) }
	});
	expect(unlink.ok()).toBeTruthy();

	await page.goto('/admin/users');
	await waitReady(page);
	await page.getByLabel('Items per page').selectOption('1');
	const emailTh = page.getByRole('columnheader', { name: 'Email' });
	await emailTh.getByRole('button').click(); // ascending by email
	const nav = page.getByRole('navigation', { name: 'Pages of users' });
	const total = Number((await nav.innerText()).match(/of (\d+)/)![1]);
	// walk to the page that shows the qa- user
	let found = false;
	for (let i = 1; i <= total && !found; i++) {
		if ((await page.locator('tbody tr', { hasText: QA_USER_EMAIL }).count()) > 0) found = true;
		else await nav.getByRole('button', { name: 'Next page' }).click();
	}
	expect(found, 'qa- user listed').toBe(true);
	const before = (await nav.innerText()).match(/Page (\d+) of (\d+)/)!;
	const row = page.locator('tbody tr', { hasText: QA_USER_EMAIL });
	await row.getByRole('button', { name: /^Actions for/ }).click();
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	const dlg = page.getByRole('alertdialog').or(page.getByRole('dialog'));
	await expect(dlg).toContainText('delete New User');
	await dlg.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByText('User Successfully Removed.')).toBeVisible({ timeout: 30000 });
	// the rows show placeholders while the data refreshes, so wait for the new page count
	await expect(nav.getByText(`of ${Number(before[2]) - 1}`)).toBeVisible({ timeout: 20000 });
	await expect(page.locator('tbody tr', { hasText: QA_USER_EMAIL })).toHaveCount(0);
	// still the same page number, now showing the next user; the total dropped by one
	const after = (await nav.innerText()).match(/Page (\d+) of (\d+)/)!;
	expect(after[1]).toBe(before[1]);
	expect(Number(after[2])).toBe(Number(before[2]) - 1);
	await expect(page.locator('tbody tr')).toHaveCount(1);
	await shot(page, 'list-browsing-pagination-keeps-page-after-row-action');
	await ctx.close();
});

async function qaUserIdFor(page: import('@playwright/test').Page) {
	const { qaUserId } = await import('./data');
	return qaUserId(page);
}

test('Cleanup: delete the qa- property through the UI and verify nothing qa- is left', async ({ browser }) => {
	test.setTimeout(120000);
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	await signIn(page, 'admin');
	await page.goto('/admin/properties');
	await waitReady(page);
	await page.getByLabel('Items per page').selectOption('10');
	await page.getByRole('button', { name: `Actions for ${QA_PROP}` }).click();
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	const dlg = page.getByRole('alertdialog').or(page.getByRole('dialog'));
	await expect(dlg).toContainText(`delete ${QA_PROP}`);
	await dlg.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByText('Property Successfully Removed.')).toBeVisible({ timeout: 30000 });
	await page.reload();
	await waitReady(page);
	await expect(page.locator('tbody tr', { hasText: /qa-/i })).toHaveCount(0);
	await expect(page.locator('tbody tr', { hasText: 'boom' })).toHaveCount(1);
	await page.goto('/admin/users');
	await waitReady(page);
	await expect(page.locator('tbody tr', { hasText: QA_USER_EMAIL })).toHaveCount(0);
	await ctx.close();
});
