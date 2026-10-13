import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
	ADMIN,
	TENANT,
	email,
	fillLease,
	leaseItems,
	openLeasesTab,
	PDF,
	ready,
	saveLease,
	saveState,
	loadState,
	shot,
	newSession,
	leaseIdsAt
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let ctx: BrowserContext;
let page: Page;
test.beforeAll(async ({ browser }) => {
	({ ctx, page } = await newSession(browser, 'admin'));
});
test.afterAll(async () => {
	await ctx.close();
});

const newLease = async (propertyId: string) => {
	await page.goto(`/admin/properties/${propertyId}/leases/new`);
	await ready(page);
};
/** After a successful save, wait for the app to leave the form (or show a message). */
async function afterSave() {
	await page.waitForTimeout(3500);
	console.log(
		'AFTER SAVE url:',
		page.url(),
		'| alert:',
		(
			await page
				.getByRole('alert')
				.allInnerTexts()
				.catch(() => [])
		)
			.join(' / ')
			.replace(/\S+@\S+/g, '<e>'),
		'| toast/status:',
		(
			await page
				.getByRole('status')
				.allInnerTexts()
				.catch(() => [])
		).join(' / ')
	);
	await page.screenshot({
		path: `/tmp/claude-0/-home-user-svelte-property-management/b6fd1526-618f-54c8-bcdb-1d6a74c5bba2/scratchpad/aftersave-${Date.now()}.png`,
		fullPage: true
	});
}

test('leases: Admin email', async () => {
	const { propA } = loadState();
	await newLease(propA);
	await fillLease(page, {
		startDate: '2026-06-01',
		endDate: '2026-08-31',
		emails: [ADMIN.email, email('adm')]
	});
	await saveLease(page);
	await expect(page.getByRole('alert')).toContainText(/admin/i, { timeout: 20000 });
	console.log(
		'ADMIN CONFLICT:',
		(await page.getByRole('alert').innerText()).replace(/@\S+/g, '<email>').replace(/\n+/g, ' | ')
	);
	await shot(page, 'leases-admin-email');
	expect((await leaseIdsAt(page, propA)).length).toBe(0);
});

test('leases: New email creates an account, existing tenant attached, PDF attached', async () => {
	const { propA } = loadState();
	await newLease(propA);
	await fillLease(page, {
		startDate: '2026-06-01',
		endDate: '2026-08-31',
		emails: [TENANT.email, email('t1')]
	});
	await page
		.locator('input[name=document]')
		.setInputFiles({ name: 'qa-lease-a1.pdf', mimeType: 'application/pdf', buffer: PDF });
	await saveLease(page);
	await afterSave();
	const ids = await leaseIdsAt(page, propA);
	expect(ids.length).toBe(1);
	saveState({ leaseA1: ids[0] });
	await expect(leaseItems(page)).toHaveCount(1);
	await expect(leaseItems(page).first()).toContainText('ended');
	await expect(leaseItems(page).first()).toContainText(email('t1'));
	await expect(leaseItems(page).first()).toContainText('$1,200.00');
	await shot(page, 'leases-create-valid-lease-and-existing-tenant');
	// the new account on the Users page
	await page.goto('/admin/users');
	await ready(page);
	await page
		.getByRole('searchbox')
		.or(page.getByRole('textbox', { name: /search/i }))
		.first()
		.fill(email('t1'))
		.catch(() => {});
	await page.waitForTimeout(800);
	const row = page
		.locator('tr, li')
		.filter({ hasText: email('t1') })
		.first();
	await expect(row).toContainText('New User');
	await shot(page, 'leases-new-email-account-created');
	// existing tenant not duplicated
	await page
		.getByRole('searchbox')
		.or(page.getByRole('textbox', { name: /search/i }))
		.first()
		.fill(TENANT.email)
		.catch(() => {});
	await page.waitForTimeout(800);
	const n = await page.locator('tr, li').filter({ hasText: TENANT.email }).count();
	console.log('tenant rows for existing email:', n);
	await shot(page, 'leases-existing-tenant-no-account-created');
	expect(n).toBeGreaterThan(0);
});

test('leases: Back-to-back leases', async () => {
	const { propA } = loadState();
	await newLease(propA);
	await fillLease(page, { startDate: '2026-09-01', endDate: '2027-08-31', emails: [email('t1')] });
	await saveLease(page);
	await afterSave();
	const ids = await leaseIdsAt(page, propA);
	expect(ids.length).toBe(2);
	saveState({ leaseA2: ids.find((i) => i !== loadState().leaseA1) });
	await expect(leaseItems(page)).toHaveCount(2);
	await shot(page, 'leases-back-to-back-leases');
});

test('leases: Overlap warning, then Save anyway', async () => {
	const { propA } = loadState();
	await newLease(propA);
	await fillLease(page, { startDate: '2026-10-01', endDate: '2026-12-31', emails: [email('t2')] });
	await saveLease(page);
	await expect(page.getByRole('button', { name: 'Save anyway' })).toBeVisible({ timeout: 20000 });
	console.log('OVERLAP:', (await page.getByRole('alert').innerText()).replace(/\n+/g, ' | '));
	await expect(page.getByRole('alert')).toContainText('2026-09-01 to 2027-08-31');
	await expect(page.getByRole('alert')).toContainText('New User');
	await shot(page, 'leases-overlap-warning');
	expect((await leaseIdsAt(page, propA)).length).toBe(2);
	// confirm
	await newLease(propA);
	await fillLease(page, { startDate: '2026-10-01', endDate: '2026-12-31', emails: [email('t2')] });
	await saveLease(page);
	await page.getByRole('button', { name: 'Save anyway' }).click();
	await afterSave();
	const ids = await leaseIdsAt(page, propA);
	expect(ids.length).toBe(3);
	saveState({ leaseA3: ids.find((i) => i !== loadState().leaseA1 && i !== loadState().leaseA2) });
	await expect(leaseItems(page)).toHaveCount(3);
	await shot(page, 'leases-overlap-confirmed-save-anyway');
});

test('leases: Property with an ended and current lease lists newest start first', async () => {
	const { propA } = loadState();
	await openLeasesTab(page, propA);
	const texts = await leaseItems(page).allInnerTexts();
	console.log(
		'LIST ORDER:',
		texts.map((t) => t.replace(/\n+/g, ' ').replace(/@\S+/g, '<e>').slice(0, 90))
	);
	expect(texts[0]).toContain('2026-10-01');
	expect(texts[2]).toContain('2026-06-01');
	await expect(leaseItems(page).nth(2)).toContainText('ended');
	await expect(leaseItems(page).nth(0)).toContainText('current');
	await shot(page, 'leases-property-with-leases');
});

test('leases: Tenant on an overlapping lease at another property', async () => {
	const { propA, propB } = loadState();
	await newLease(propB);
	await fillLease(page, {
		startDate: '2026-11-01',
		endDate: '2027-06-30',
		emails: [email('t1'), email('t3')]
	});
	await saveLease(page);
	await expect(page.getByRole('alert')).toContainText(/101 QA Alpha St, Terre Haute/, {
		timeout: 20000
	});
	console.log(
		'TENANT CONFLICT:',
		(await page.getByRole('alert').innerText()).replace(/\n+/g, ' | ')
	);
	await shot(page, 'leases-tenant-on-an-overlapping-lease');
	expect((await leaseIdsAt(page, propB)).length).toBe(0);
	// no account was created for the other email in the same request
	await page.goto('/admin/users');
	await ready(page);
	await page
		.getByRole('searchbox')
		.or(page.getByRole('textbox', { name: /search/i }))
		.first()
		.fill(email('t3'))
		.catch(() => {});
	await page.waitForTimeout(800);
	expect(
		await page
			.locator('tr, li')
			.filter({ hasText: email('t3') })
			.count()
	).toBe(0);
	await page
		.getByRole('searchbox')
		.or(page.getByRole('textbox', { name: /search/i }))
		.first()
		.fill(email('adm'))
		.catch(() => {});
	await page.waitForTimeout(800);
	expect(
		await page
			.locator('tr, li')
			.filter({ hasText: email('adm') })
			.count()
	).toBe(0);
});

test('leases: Same email twice, in any case', async () => {
	const { propB } = loadState();
	await newLease(propB);
	const dup = email('dup');
	await fillLease(page, {
		startDate: '2026-10-01',
		endDate: '2027-09-30',
		emails: [dup.toUpperCase().replace('EXAMPLE.COM', 'Example.com'), dup]
	});
	await saveLease(page);
	await afterSave();
	await openLeasesTab(page, propB);
	await expect(leaseItems(page)).toHaveCount(1);
	const tenants = await leaseItems(page)
		.first()
		.getByRole('list', { name: 'Tenants' })
		.locator('li')
		.count();
	expect(tenants).toBe(1);
	await shot(page, 'leases-same-email-twice');
	saveState({ leaseB1: (await leaseIdsAt(page, propB))[0] });
});

test('leases: Upcoming month-to-month lease', async () => {
	const { propB } = loadState();
	await newLease(propB);
	await fillLease(page, { startDate: '2027-10-01', endDate: '', emails: [email('t4')] });
	await saveLease(page);
	await afterSave();
	await openLeasesTab(page, propB);
	await expect(leaseItems(page)).toHaveCount(2);
	await expect(leaseItems(page).first()).toContainText('upcoming');
	await expect(leaseItems(page).first()).toContainText('month to month');
	await shot(page, 'leases-lease-status-upcoming-and-month-to-month');
});
