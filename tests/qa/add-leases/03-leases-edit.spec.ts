import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
	ADMIN,
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
	leaseIdsAt,
	SCRATCH
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

/** Save; if the overlap warning shows (A2 and A3 overlap by design), choose Save anyway. */
async function saveConfirm(shotName?: string) {
	await saveLease(page);
	const anyway = page.getByRole('button', { name: 'Save anyway' });
	await Promise.race([
		anyway.waitFor({ timeout: 8000 }).catch(() => {}),
		page.waitForURL(/tab=leases/, { timeout: 8000 }).catch(() => {})
	]);
	if (await anyway.isVisible()) {
		if (shotName) await shot(page, shotName);
		await anyway.click();
	}
	await page.waitForTimeout(3500);
}
const editLease = async (propertyId: string, leaseId: string) => {
	await page.goto(`/admin/properties/${propertyId}/leases/${leaseId}`);
	await ready(page);
};
const usersSearch = async (q: string) => {
	await page.goto('/admin/users');
	await ready(page);
	await page
		.getByRole('searchbox')
		.or(page.getByRole('textbox', { name: /search/i }))
		.first()
		.fill(q)
		.catch(() => {});
	await page.waitForTimeout(800);
	return page.locator('tr, li').filter({ hasText: q }).count();
};

test('leases: Edit - add a tenant (new account, welcome email attempt)', async () => {
	const { propA, leaseA2 } = loadState();
	await editLease(propA, leaseA2);
	await expect(page.getByLabel('Tenant email 1', { exact: true })).toHaveValue(email('t1'));
	await fillLease(page, { emails: [email('t1'), email('t5')] });
	await saveConfirm('leases-edit-overlap-rules-apply');
	console.log(
		'ADD TENANT url',
		page.url(),
		(await page.getByRole('alert').allInnerTexts())
			.join('|')
			.replace(/\S+@\S+/g, '<e>')
			.replace(/\n+/g, ' ')
	);
	await shot(page, 'leases-edit-add-a-tenant');
	await openLeasesTab(page, propA);
	await expect(leaseItems(page).filter({ hasText: '2026-09-01' })).toContainText(email('t5'));
	expect(await usersSearch(email('t5'))).toBeGreaterThan(0);
});

test('leases: Edit - remove one of two tenants keeps the account', async () => {
	const { propA, leaseA2 } = loadState();
	await editLease(propA, leaseA2);
	await page.getByRole('button', { name: 'Remove tenant email 2' }).click();
	await saveConfirm();
	await openLeasesTab(page, propA);
	const row = leaseItems(page).filter({ hasText: '2026-09-01' });
	await expect(row).toContainText(email('t1'));
	await expect(row).not.toContainText(email('t5'));
	await shot(page, 'leases-edit-remove-a-tenant');
	expect(await usersSearch(email('t5'))).toBeGreaterThan(0);
	await shot(page, 'leases-edit-removed-tenant-account-kept');
});

test('leases: Edit - remove the last tenant', async () => {
	const { propA, leaseA3 } = loadState();
	await editLease(propA, leaseA3);
	await page.getByRole('button', { name: 'Remove tenant email 1' }).click();
	await saveLease(page);
	await expect(page.getByText('A lease needs at least one tenant.')).toBeVisible();
	await shot(page, 'leases-edit-remove-the-last-tenant');
	await openLeasesTab(page, propA);
	await expect(leaseItems(page).filter({ hasText: '2026-10-01' })).toContainText(email('t2'));
});

test('leases: Edit - same conflict rule (admin email) applies', async () => {
	const { propA, leaseA3 } = loadState();
	await editLease(propA, leaseA3);
	await fillLease(page, { emails: [email('t2'), ADMIN.email] });
	await saveLease(page);
	await expect(page.getByRole('alert')).toContainText(/admin/i, { timeout: 20000 });
	await shot(page, 'leases-edit-conflict-rules-apply');
});

test('leases: Lease document - wrong type', async () => {
	const { propA, leaseA3 } = loadState();
	await editLease(propA, leaseA3);
	await page
		.locator('input[name=document]')
		.setInputFiles({
			name: 'qa-notes.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('not a pdf')
		});
	await saveLease(page);
	if (
		await page
			.getByRole('button', { name: 'Save anyway' })
			.isVisible({ timeout: 8000 })
			.catch(() => false)
	)
		await page.getByRole('button', { name: 'Save anyway' }).click();
	await page.waitForTimeout(3000);
	console.log(
		'WRONG TYPE:',
		(await page.getByRole('alert').allInnerTexts()).join('|'),
		'| url',
		page.url()
	);
	await expect(page.getByRole('alert')).toBeVisible();
	await shot(page, 'leases-document-wrong-type');
});

test('leases: Lease document - a file named .pdf that is not a PDF', async () => {
	const { propA, leaseA3 } = loadState();
	await editLease(propA, leaseA3);
	await page
		.locator('input[name=document]')
		.setInputFiles({
			name: 'qa-fake.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('this is plain text, not a pdf')
		});
	await saveLease(page);
	if (
		await page
			.getByRole('button', { name: 'Save anyway' })
			.isVisible({ timeout: 8000 })
			.catch(() => false)
	)
		await page.getByRole('button', { name: 'Save anyway' }).click();
	await page.waitForTimeout(3000);
	console.log(
		'FAKE PDF:',
		(await page.getByRole('alert').allInnerTexts()).join('|'),
		'| url',
		page.url()
	);
	await shot(page, 'leases-document-fake-pdf');
});

test('leases: Lease document - larger than 10 MB (browser check)', async () => {
	const { propA, leaseA3 } = loadState();
	await editLease(propA, leaseA3);
	const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 + 10, 32)]);
	await page
		.locator('input[name=document]')
		.setInputFiles({ name: 'qa-big.pdf', mimeType: 'application/pdf', buffer: big });
	await page.waitForTimeout(500);
	await expect(page.getByText('The lease document must be 10 MB or smaller.')).toBeVisible();
	await shot(page, 'leases-document-larger-than-10-mb');
	// what a Save does after the browser cleared the file
	console.log(
		'FILE INPUT after oversize:',
		await page.locator('input[name=document]').evaluate((i: HTMLInputElement) => i.files?.length)
	);
});

test('leases: Lease document - larger than 10 MB (server check, browser check bypassed)', async () => {
	const { propA, leaseA3 } = loadState();
	await editLease(propA, leaseA3);
	const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 + 10, 32)]);
	const origin = new URL(page.url()).origin;
	const res = await page.request.post(`${origin}/admin/properties/${propA}/leases/${leaseA3}`, {
		headers: { origin, 'x-sveltekit-action': 'true' },
		multipart: {
			rent: '1200',
			startDate: '2026-10-01',
			endDate: '2026-12-31',
			emails: email('t2'),
			confirmOverlap: 'true',
			document: { name: 'qa-big.pdf', mimeType: 'application/pdf', buffer: big }
		}
	});
	const body = (await res.text()).replace(/qa-\S+@example\.com/g, '<e>');
	console.log('SERVER BIG:', res.status(), body.slice(0, 400));
	await page.goto(`/admin/properties/${propA}/leases/${leaseA3}`);
	await ready(page);
	await expect(page.getByText('View document')).toHaveCount(0);
	await shot(page, 'leases-document-larger-than-10-mb-server');
});

test('leases: Lease document - attach, then replace', async () => {
	const { propA, leaseA1 } = loadState();
	await editLease(propA, leaseA1);
	await expect(page.getByText(/Current: qa-lease-a1/)).toBeVisible();
	await expect(page.getByRole('link', { name: 'View document' })).toBeVisible();
	await shot(page, 'leases-document-attach');
	// shot() masks non-qa- emails in the form inputs (the QA tenant's address), which would then be
	// submitted as "<masked email>". Reload the form before saving.
	await editLease(propA, leaseA1);
	const name = `qa-lease-a1-v${Date.now().toString(36)}.pdf`;
	await page
		.locator('input[name=document]')
		.setInputFiles({
			name,
			mimeType: 'application/pdf',
			buffer: Buffer.concat([PDF, Buffer.from('replacement')])
		});
	await saveConfirm();
	// The replacement may take a moment to show: poll the edit page and log how long it took.
	const started = Date.now();
	await expect(async () => {
		await editLease(propA, leaseA1);
		await expect(page.getByText(`Current: ${name}`)).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 30000 });
	console.log('REPLACED DOC visible after extra ms:', Date.now() - started);
	await shot(page, 'leases-document-replace');
});

test('leases: Delete a lease with no payments (and its document)', async () => {
	const { propA, leaseA3 } = loadState();
	await editLease(propA, leaseA3);
	await page
		.locator('input[name=document]')
		.setInputFiles({ name: 'qa-lease-a3.pdf', mimeType: 'application/pdf', buffer: PDF });
	await saveConfirm();
	await editLease(propA, leaseA3);
	await expect(page.getByRole('link', { name: 'View document' })).toBeVisible();
	await page.getByRole('button', { name: 'Delete lease' }).click();
	await shot(page, 'leases-delete-confirm');
	await page.getByRole('button', { name: 'Confirm' }).click();
	await expect(page).toHaveURL(/tab=leases/, { timeout: 20000 });
	await ready(page);
	await expect(leaseItems(page)).toHaveCount(2);
	const gone = await page.request.get(`/api/lease/${leaseA3}/document`);
	console.log('DOC after delete:', gone.status());
	await shot(page, 'leases-delete-no-payments');
});

test('leases: Delete a lease through the API for a missing lease', async () => {
	const r = await page.request.delete('/api/lease/qa-does-not-exist');
	console.log('DELETE missing lease', r.status());
});
