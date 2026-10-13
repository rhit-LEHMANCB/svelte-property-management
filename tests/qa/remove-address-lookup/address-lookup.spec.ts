import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { signIn } from '../../e2e/support/helpers';

const SHOTS = 'openspec/changes/remove-address-lookup/qa/screenshots';
const admin = { email: process.env.QA_ADMIN_EMAIL ?? '', password: process.env.QA_ADMIN_PASSWORD ?? '' };
const tenant = { email: process.env.QA_TENANT_EMAIL ?? '', password: process.env.QA_TENANT_PASSWORD ?? '' };
const TITLE = `qa-address-${Date.now()}`;
const ADDR = { street: '1 QA Test St', apt: 'Unit 7Q', city: 'Terre Haute', state: 'IN', zip: '47803' };

const isMaps = (url: string) => /maps\.googleapis\.com|maps\.gstatic\.com/.test(url);

async function shot(page: Page, name: string) {
	await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });
}

async function fillAddress(page: Page) {
	await page.getByTitle('Street Address').fill(ADDR.street);
	await page.getByTitle('Apartment Info').fill(ADDR.apt);
	await page.getByTitle('City').fill(ADDR.city);
	await page.getByTitle('State').fill(ADDR.state);
	await page.getByTitle('Zip Code').fill(ADDR.zip);
}

async function expectAddressFields(page: Page) {
	for (const t of ['Street Address', 'Apartment Info', 'City', 'State', 'Zip Code']) {
		await expect(page.getByTitle(t, { exact: true })).toBeVisible();
	}
	await expect(page.getByText(/address lookup/i)).toHaveCount(0);
	await expect(page.getByLabel(/address lookup/i)).toHaveCount(0);
	await expect(page.getByPlaceholder(/lookup|search address|search for an address/i)).toHaveCount(0);
}

async function deleteQaProperties(page: Page) {
	await page.goto('/admin/properties');
	await page.waitForLoadState('networkidle');
	const trigger = page.getByRole('button', { name: `Actions for ${TITLE}` });
	if ((await trigger.count()) === 0) return;
	await trigger.click();
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	await page.getByRole('button', { name: /confirm|yes|ok|delete/i }).last().click();
	await expect(page.getByText(TITLE)).toHaveCount(0, { timeout: 15000 });
}

test.describe.serial('remove-address-lookup', () => {
	let context: BrowserContext;
	let page: Page;
	let propertyId = '';
	const mapsRequests: string[] = [];
	const consoleMsgs: string[] = [];

	test.beforeAll(async ({ browser }) => {
		test.skip(!admin.email || !tenant.email, 'environment: QA credentials missing');
		context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
		page = await context.newPage();
		page.on('request', (r) => {
			if (isMaps(r.url())) mapsRequests.push(r.url());
		});
		page.on('console', (m) => {
			if (['error', 'warning'].includes(m.type()) && /google|maps|places/i.test(m.text()))
				consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 200)}`);
		});
		await signIn(page, admin);
	});

	test.afterAll(async () => {
		try {
			await deleteQaProperties(page);
		} finally {
			await context?.close();
		}
	});

	test('Form fields', async () => {
		await page.goto('/admin/properties/add');
		await page.waitForLoadState('networkidle');
		await expectAddressFields(page);
		await shot(page, 'property-management-form-fields-add');
		// create the property to check the edit page later (also fills the form: used by the request check)
		await page.getByTitle('Title').fill(TITLE);
		await page.getByTitle('Rent').fill('1');
		await page.getByTitle('Description').fill('QA test property, safe to delete');
		await page.getByTitle('Bedrooms').fill('1');
		await page.getByTitle('Bathrooms').fill('1');
		await page.getByTitle('Square Feet').fill('100');
		await fillAddress(page);
		await page.getByRole('button', { name: 'Save' }).click();
		await page.waitForURL(/\/admin\/properties\/[^/]+\/edit/, { timeout: 20000 });
		propertyId = page.url().match(/properties\/([^/]+)\/edit/)![1];
		await page.waitForLoadState('networkidle');
		await expectAddressFields(page);
		await shot(page, 'property-management-form-fields-edit');
	});

	test('Typed address is saved', async () => {
		await page.goto(`/admin/properties/${propertyId}/edit`);
		await page.waitForLoadState('networkidle');
		// retype with a different, exact address then reload
		await page.getByTitle('Street Address').fill('22 QA Test Ave');
		await page.getByTitle('Apartment Info').fill('Apt 3B');
		await page.getByTitle('City').fill('Terre Haute');
		await page.getByTitle('State').fill('IN');
		await page.getByTitle('Zip Code').fill('47803');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText(/Successfully added info/i)).toBeVisible({ timeout: 15000 });
		await page.reload();
		await page.waitForLoadState('networkidle');
		await expect(page.getByTitle('Street Address')).toHaveValue('22 QA Test Ave');
		await expect(page.getByTitle('Apartment Info')).toHaveValue('Apt 3B');
		await expect(page.getByTitle('City')).toHaveValue('Terre Haute');
		await expect(page.getByTitle('State')).toHaveValue('IN');
		await expect(page.getByTitle('Zip Code')).toHaveValue('47803');
		await shot(page, 'property-management-typed-address-saved');
	});

	test('No third-party lookup requests', async () => {
		mapsRequests.length = 0;
		consoleMsgs.length = 0;
		for (const url of ['/admin/properties/add', `/admin/properties/${propertyId}/edit`]) {
			await page.goto(url);
			await page.waitForLoadState('networkidle');
			await page.getByTitle('Street Address').pressSequentially('300 Typing Check', { delay: 30 });
			await page.getByTitle('City').pressSequentially('Terre', { delay: 30 });
			await page.waitForTimeout(1500);
		}
		const scripts = await page.evaluate(() =>
			[...document.scripts].map((s) => s.src).filter((s) => /google|maps/i.test(s))
		);
		console.log('maps requests:', mapsRequests.length, 'google console msgs:', consoleMsgs.length, 'maps scripts:', scripts.length);
		expect(mapsRequests).toEqual([]);
		expect(consoleMsgs).toEqual([]);
		expect(scripts).toEqual([]);
		await shot(page, 'property-management-no-third-party-lookup-requests');
	});

	test('Autocomplete opens and shows suggestions (tenant picker)', async () => {
		await page.goto(`/admin/properties/${propertyId}/edit`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('tab', { name: 'Tenants' }).click();
		const input = page.getByPlaceholder('Search...').first();
		await expect(input).toBeVisible();
		await input.click();
		const options = page.locator('[data-scope="combobox"][data-part="item"]');
		await expect(options.first()).toBeVisible();
		const count = await options.count();
		expect(count).toBeGreaterThan(0);
		// type to filter, then pick a suggestion (fills the field only; Add is never clicked)
		const firstLabel = ((await options.first().innerText()) ?? '').trim();
		await input.fill(firstLabel.slice(0, 3));
		await expect(options.first()).toBeVisible();
		await options.first().click();
		await expect(input).not.toHaveValue('');
		await shot(page, 'app-platform-autocomplete-selection');
		// leave without adding the tenant
	});

	test('Regression: admin top-level pages', async () => {
		const errors: string[] = [];
		const onErr = (e: Error) => errors.push(`pageerror: ${e.message.slice(0, 150)}`);
		page.on('pageerror', onErr);
		const bad: string[] = [];
		const onResp = (r: import('@playwright/test').Response) => {
			if (r.status() >= 500) bad.push(`${r.status()} ${new URL(r.url()).pathname}`);
		};
		page.on('response', onResp);
		for (const p of ['/admin', '/profile', '/admin/maintenance', '/admin/properties', '/admin/users']) {
			await page.goto(p);
			await page.waitForLoadState('networkidle');
			await expect(page).toHaveURL(new RegExp(p + '$'));
			await expect(page.locator('body')).not.toContainText(/internal error|something went wrong/i);
		}
		await shot(page, 'regression-admin-pages');
		page.off('pageerror', onErr);
		page.off('response', onResp);
		expect(errors).toEqual([]);
		expect(bad).toEqual([]);
	});

	test('Regression: tenant top-level pages', async ({ browser }) => {
		const tctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
		const tp = await tctx.newPage();
		const errors: string[] = [];
		tp.on('pageerror', (e) => errors.push(e.message.slice(0, 150)));
		tp.on('response', (r) => {
			if (r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
		});
		await signIn(tp, tenant);
		for (const p of ['/', '/maintenance', '/payment', '/profile', '/insurance']) {
			await tp.goto(p);
			await tp.waitForLoadState('networkidle');
			await expect(tp).toHaveURL(new RegExp(p + '$'));
			await expect(tp.locator('body')).not.toContainText(/internal error|something went wrong/i);
		}
		await tp.goto('/');
		await tp.waitForLoadState('networkidle');
		await shot(tp, 'regression-tenant-pages');
		await tctx.close();
		expect(errors).toEqual([]);
	});

	test('Cleanup verified: qa property is gone', async () => {
		await deleteQaProperties(page);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		await expect(page.getByText(TITLE)).toHaveCount(0);
		const resp = await page.goto(`/admin/properties/${propertyId}/edit`);
		console.log('edit page after delete status', resp?.status());
	});
});
