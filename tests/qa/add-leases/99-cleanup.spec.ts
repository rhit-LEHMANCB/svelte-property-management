import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
	RUN,
	email,
	ready,
	loadState,
	shot,
	newSession,
	leaseItems,
	openLeasesTab,
	deleteUserByEmail,
	leaseIdsAt,
	saveState
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

let actx: BrowserContext, tctx: BrowserContext;
let apage: Page, tpage: Page;
test.beforeAll(async ({ browser }) => {
	({ ctx: actx, page: apage } = await newSession(browser, 'admin'));
	({ ctx: tctx, page: tpage } = await newSession(browser, 'tenant'));
});
test.afterAll(async () => {
	await actx.close();
	await tctx.close();
});

async function deleteLeaseViaButton(propertyId: string, leaseId: string) {
	await apage.goto(`/admin/properties/${propertyId}/leases/${leaseId}`);
	await ready(apage);
	await apage.getByRole('button', { name: 'Delete lease' }).click();
	await apage.getByRole('button', { name: 'Confirm' }).click();
	await expect(apage).toHaveURL(/tab=leases/, { timeout: 20000 });
}

test('cleanup: delete qa- leases without payments', async () => {
	const { propA, propB, leaseA2 } = loadState();
	await deleteLeaseViaButton(propA, leaseA2);
	for (const id of await leaseIdsAt(apage, propB)) await deleteLeaseViaButton(propB, id);
	await openLeasesTab(apage, propB);
	await expect(apage.getByText('No leases', { exact: true })).toBeVisible();
});

test('cleanup: delete qa- users', async () => {
	for (const tag of ['t2', 't5', 'dup', 't3', 'adm', 'u1', 't1', 't4']) {
		const done = await deleteUserByEmail(apage, email(tag));
		console.log('user', tag, done ? 'deleted' : 'not present');
	}
	await apage.goto('/admin/users');
	await ready(apage);
	await apage
		.getByRole('searchbox')
		.or(apage.getByRole('textbox', { name: /search/i }))
		.first()
		.fill(`qa-${RUN}`)
		.catch(() => {});
	await apage.waitForTimeout(800);
	expect(
		await apage
			.locator('tr, li')
			.filter({ hasText: `qa-${RUN}` })
			.count()
	).toBe(0);
	await shot(apage, 'cleanup-qa-users-removed');
});

test('property-management: Cascade - deleting a property with a paid lease removes its leases', async () => {
	const { propA, leaseA1 } = loadState();
	const before = await apage.request.get(`/api/lease/${leaseA1}/document`);
	console.log('A1 document before property delete:', before.status());
	expect(before.status()).toBe(200);
	await apage.goto('/admin/properties');
	await ready(apage);
	await apage.getByRole('button', { name: /^Actions for qa-Property A/ }).click();
	await apage.getByRole('menuitem', { name: 'Delete' }).click();
	await apage.getByRole('button', { name: 'Confirm' }).click();
	await apage.waitForTimeout(5000);
	await apage.goto('/admin/properties');
	await ready(apage);
	await expect(apage.getByText(/qa-Property A/)).toHaveCount(0);
	const after = await apage.request.get(`/api/lease/${leaseA1}/document`);
	console.log('A1 document after property delete:', after.status());
	expect(after.status()).toBe(403);
	const gone = await apage.goto(`/admin/properties/${propA}/edit`);
	console.log('deleted property edit page:', gone?.status());
	await shot(apage, 'property-management-cascade-property-deleted');
	// the tenant can still load the app
	await tpage.goto('/');
	await ready(tpage);
	await expect(tpage.getByText('203 Lakeshore Dr, Batesville').first()).toBeVisible();
	await tpage.goto('/payment');
	await ready(tpage);
	await shot(tpage, 'property-management-cascade-tenant-app-still-loads');
});

test('cleanup: delete property B', async () => {
	await apage.goto('/admin/properties');
	await ready(apage);
	await apage.getByRole('button', { name: /^Actions for qa-Property B/ }).click();
	await apage.getByRole('menuitem', { name: 'Delete' }).click();
	await apage.getByRole('button', { name: 'Confirm' }).click();
	await apage.waitForTimeout(4000);
	await apage.goto('/admin/properties');
	await ready(apage);
	await expect(apage.getByText(/qa-Property/)).toHaveCount(0);
	await shot(apage, 'cleanup-qa-properties-removed');
});
