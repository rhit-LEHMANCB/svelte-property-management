import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
	TENANT,
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
	payA,
	RUN
} from './helpers';

// Re-runs the scenarios that the first full run skipped after an earlier failure in a serial file
// (delete without payments, user delete), with the screenshots now masked.
test.describe.configure({ mode: 'serial' });
test.setTimeout(170_000);

let actx: BrowserContext, tctx: BrowserContext;
let apage: Page, tpage: Page;
let propD = '',
	d1 = '',
	d2 = '',
	d3 = '';
test.beforeAll(async ({ browser }) => {
	({ ctx: actx, page: apage } = await newSession(browser, 'admin'));
	({ ctx: tctx, page: tpage } = await newSession(browser, 'tenant'));
});
test.afterAll(async () => {
	await actx.close();
	await tctx.close();
});

async function create(emails: string[], start: string, end: string, doc = false) {
	await apage.goto(`/admin/properties/${propD}/leases/new`);
	await ready(apage);
	await fillLease(apage, { startDate: start, endDate: end, emails });
	if (doc)
		await apage
			.locator('input[name=document]')
			.setInputFiles({ name: 'qa-lease-d.pdf', mimeType: 'application/pdf', buffer: PDF });
	await saveLease(apage);
	await apage.waitForTimeout(5000);
	const ids = await leaseIdsAt(apage, propD);
	return ids;
}

test('rerun: setup property and leases', async () => {
	propD = await createProperty(apage, `qa-Property D ${RUN}`, '1100', '404 QA Delta St');
	d1 = (await create([TENANT.email, email('x1')], '2026-06-01', '2026-08-31'))[0];
	const ids2 = await create([email('x1')], '2026-09-01', '2027-08-31');
	d2 = ids2.find((i) => i !== d1)!;
	const ids3 = await create([email('y1')], '2027-10-01', '', true);
	d3 = ids3.find((i) => i !== d1 && i !== d2)!;
	expect(new Set([d1, d2, d3]).size).toBe(3);
});

test('leases: Delete a lease with no payments (and its document)', async () => {
	await apage.goto(`/admin/properties/${propD}/leases/${d3}`);
	await ready(apage);
	await expect(apage.getByRole('link', { name: 'View document' })).toBeVisible();
	const before = await apage.request.get(`/api/lease/${d3}/document`);
	await apage.getByRole('button', { name: 'Delete lease' }).click();
	await shot(apage, 'leases-delete-confirm');
	await apage.getByRole('button', { name: 'Confirm' }).click();
	await expect(apage).toHaveURL(/tab=leases/, { timeout: 20000 });
	await ready(apage);
	await expect(leaseItems(apage)).toHaveCount(2);
	const after = await apage.request.get(`/api/lease/${d3}/document`);
	console.log('DOC before/after delete:', before.status(), after.status());
	expect(before.status()).toBe(200);
	expect(after.status()).toBe(403);
	await shot(apage, 'leases-delete-no-payments');
	const missing = await apage.request.delete('/api/lease/qa-does-not-exist');
	console.log('DELETE missing lease', missing.status());
	expect(missing.status()).toBe(404);
});

test('rerun: give D1 a payment', async () => {
	await payA(tpage, '50', '404 QA Delta St');
	await expect(async () => {
		await tpage.goto('/payment');
		await ready(tpage);
		await expect(
			tpage.locator('[data-lease]').filter({ hasText: '404 QA Delta St' })
		).toContainText('$3,250.00', { timeout: 3000 });
	}).toPass({ timeout: 90000, intervals: [3000] });
});

test('user-management: Delete - tenant removed from every lease; leases and payment history kept', async () => {
	expect(await deleteUserByEmail(apage, email('x1'))).toBe(true);
	await openLeasesTab(apage, propD);
	const l1 = leaseItems(apage).filter({ hasText: '2026-06-01' });
	await expect(l1).toHaveCount(1);
	await expect(l1).not.toContainText(email('x1'));
	await shot(apage, 'user-management-delete-removed-from-leases-lease-kept');
	await apage.goto(`/admin/properties/${propD}/leases/${d1}`);
	await ready(apage);
	await expect(apage.getByText('This lease has recorded payments.')).toBeVisible();
});

test('user-management: Last tenant on a lease - the lease is kept with no tenants', async () => {
	await openLeasesTab(apage, propD);
	const l2 = leaseItems(apage).filter({ hasText: '2026-09-01' });
	await expect(l2).toHaveCount(1);
	await expect(l2).toContainText('No tenants');
	await shot(apage, 'user-management-last-tenant-on-a-lease');
	await apage.goto(`/admin/properties/${propD}/leases/${d2}`);
	await ready(apage);
	await expect(apage.getByLabel('Tenant email 1', { exact: true })).toBeVisible();
	await shot(apage, 'leases-edit-page-with-no-tenants');
});

test('rerun: cleanup', async () => {
	console.log('user y1', (await deleteUserByEmail(apage, email('y1'))) ? 'deleted' : 'not present');
	console.log('user x1', (await deleteUserByEmail(apage, email('x1'))) ? 'deleted' : 'not present');
	await apage.goto(`/admin/properties/${propD}/leases/${d2}`);
	await ready(apage);
	await apage.getByRole('button', { name: 'Delete lease' }).click();
	await apage.getByRole('button', { name: 'Confirm' }).click();
	await expect(apage).toHaveURL(/tab=leases/, { timeout: 20000 });
	await apage.goto('/admin/properties');
	await ready(apage);
	await apage.getByRole('button', { name: /^Actions for qa-Property D/ }).click();
	await apage.getByRole('menuitem', { name: 'Delete' }).click();
	await apage.getByRole('button', { name: 'Confirm' }).click();
	await apage.waitForTimeout(4000);
	await apage.goto('/admin/properties');
	await ready(apage);
	await expect(apage.getByText(/qa-Property/)).toHaveCount(0);
});
