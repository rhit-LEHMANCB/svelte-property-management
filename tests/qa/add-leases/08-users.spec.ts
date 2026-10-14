import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
	email,
	ready,
	loadState,
	shot,
	newSession,
	leaseItems,
	openLeasesTab,
	deleteUserByEmail
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let actx: BrowserContext;
let apage: Page;
test.beforeAll(async ({ browser }) => {
	({ ctx: actx, page: apage } = await newSession(browser, 'admin'));
});
test.afterAll(async () => {
	await actx.close();
});

const hasUser = async (address: string) => {
	await apage.goto('/admin/users');
	await ready(apage);
	await apage
		.getByRole('searchbox')
		.or(apage.getByRole('textbox', { name: /search/i }))
		.first()
		.fill(address)
		.catch(() => {});
	await apage.waitForTimeout(800);
	return apage.locator('tr, li').filter({ hasText: address }).count();
};

test('user-management: Admin Add User (shared creation helper) with a qa- address', async () => {
	await apage.goto('/admin/users');
	await ready(apage);
	await apage.getByRole('button', { name: 'Add User' }).click();
	await apage.getByRole('dialog').locator('input').fill(email('u1'));
	await apage.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
	await apage.waitForTimeout(3000);
	console.log(
		'ADD USER toast/status:',
		(await apage.locator('[role=status], [role=alert], [data-part=toast]').allInnerTexts())
			.join(' | ')
			.replace(/\S+@\S+/g, '<e>')
	);
	await shot(apage, 'user-management-admin-add-user');
	console.log('u1 exists after Add User attempt:', await hasUser(email('u1')));
});

test('user-management: Delete - tenant removed from every lease; leases and payment history kept', async () => {
	const { propA, leaseA1 } = loadState();
	// t1 is on A1 (has payments) with the QA tenant, and is the only tenant on A2
	expect(await deleteUserByEmail(apage, email('t1'))).toBe(true);
	expect(await hasUser(email('t1'))).toBe(0);
	await openLeasesTab(apage, propA);
	const a1 = leaseItems(apage).filter({ hasText: '2026-06-01' });
	await expect(a1).toHaveCount(1);
	await expect(a1).not.toContainText(email('t1'));
	await shot(apage, 'user-management-delete-removed-from-leases-lease-kept');
	// A1 keeps its payment history: the edit page still warns about recorded payments
	await apage.goto(`/admin/properties/${propA}/leases/${leaseA1}`);
	await ready(apage);
	await expect(apage.getByText('This lease has recorded payments.')).toBeVisible();
});

test('user-management: Last tenant on a lease - the lease is kept with no tenants', async () => {
	const { propA, propB } = loadState();
	await openLeasesTab(apage, propA);
	const a2 = leaseItems(apage).filter({ hasText: '2026-09-01' });
	await expect(a2).toHaveCount(1);
	await expect(a2).toContainText('No tenants');
	await shot(apage, 'user-management-last-tenant-on-a-lease');
	// and again at the other property with a different user
	expect(await deleteUserByEmail(apage, email('t4'))).toBe(true);
	await openLeasesTab(apage, propB);
	await expect(leaseItems(apage).filter({ hasText: '2027-10-01' })).toContainText('No tenants');
	await shot(apage, 'user-management-last-tenant-second-example');
});

test('leases: Edit page for a lease whose tenants are gone shows the form', async () => {
	const { propA, leaseA2 } = loadState();
	await apage.goto(`/admin/properties/${propA}/leases/${leaseA2}`);
	await ready(apage);
	await expect(apage.getByLabel('Tenant email 1', { exact: true })).toBeVisible();
	await shot(apage, 'leases-edit-page-with-no-tenants');
});
