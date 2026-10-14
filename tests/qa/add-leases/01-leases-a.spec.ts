import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
	ADMIN,
	email,
	createProperty,
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
	ymd,
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

test('setup: create qa- properties', async () => {
	test.skip(!!loadState().propA, 'already created');
	const a = await createProperty(
		page,
		`qa-Property A ${email('x').slice(3, 12)}`,
		'1200',
		'101 QA Alpha St'
	);
	const b = await createProperty(
		page,
		`qa-Property B ${email('x').slice(3, 12)}`,
		'900',
		'202 QA Beta St'
	);
	saveState({ propA: a, propB: b });
});

test('leases: Property with no leases', async () => {
	const { propA } = loadState();
	await openLeasesTab(page, propA);
	await expect(page.getByText('No leases', { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'New lease' })).toBeVisible();
	await shot(page, 'leases-property-with-no-leases');
});

test('leases: Prefilled rent', async () => {
	const { propA } = loadState();
	await page.goto(`/admin/properties/${propA}/leases/new`);
	await ready(page);
	await expect(page.getByLabel('Monthly rent')).toHaveValue('1200');
	await page.getByLabel('Monthly rent').fill('1250');
	await expect(page.getByLabel('Monthly rent')).toHaveValue('1250');
	await shot(page, 'leases-prefilled-rent');
});

test('leases: Unknown property responds 404', async () => {
	const r = await page.goto('/admin/properties/qa-does-not-exist/leases/new');
	expect(r?.status()).toBe(404);
	await shot(page, 'leases-unknown-property');
});

test('leases: Invalid fields', async () => {
	const { propA } = loadState();
	const cases: { name: string; lease: Parameters<typeof fillLease>[1]; expectText: RegExp }[] = [
		{
			name: 'rent-zero',
			lease: { rent: '0', startDate: '2026-06-01', endDate: '2026-08-31' },
			expectText: /greater than 0/i
		},
		{
			name: 'rent-3-decimals',
			lease: { rent: '1200.123', startDate: '2026-06-01', endDate: '2026-08-31' },
			expectText: /decimal|cents|two/i
		},
		{
			name: 'no-start',
			lease: { rent: '1200', startDate: '', endDate: '2026-08-31' },
			expectText: /start date/i
		},
		{
			name: 'end-before-start',
			lease: { rent: '1200', startDate: '2026-12-01', endDate: '2026-11-01' },
			expectText: /after/i
		}
	];
	for (const c of cases) {
		await page.goto(`/admin/properties/${propA}/leases/new`);
		await ready(page);
		await fillLease(page, { ...c.lease, emails: [email('inv')] });
		await saveLease(page);
		await page.waitForTimeout(2000);
		const errs = await page.locator('.text-error-600-400').allInnerTexts();
		console.log('INVALID', c.name, JSON.stringify(errs));
		expect(errs.join(' ')).toMatch(c.expectText);
		await shot(page, `leases-invalid-fields-${c.name}`);
	}
	expect((await leaseIdsAt(page, propA)).length).toBe(0);
	await page.goto(`/admin/properties/${propA}/leases/new`);
	await ready(page);
	await fillLease(page, { rent: '0', startDate: '', endDate: '', emails: [email('inv')] });
	await saveLease(page);
	await page.waitForTimeout(1500);
	await shot(page, 'leases-invalid-fields');
});

test('leases: No tenants', async () => {
	const { propA } = loadState();
	await page.goto(`/admin/properties/${propA}/leases/new`);
	await ready(page);
	await fillLease(page, { startDate: '2026-06-01', endDate: '2026-08-31', emails: [''] });
	await saveLease(page);
	await expect(page.getByText('A lease needs at least one tenant.')).toBeVisible();
	await shot(page, 'leases-no-tenants');
	expect((await leaseIdsAt(page, propA)).length).toBe(0);
});

test('leases: Malformed email', async () => {
	const { propA } = loadState();
	await page.goto(`/admin/properties/${propA}/leases/new`);
	await ready(page);
	await fillLease(page, {
		startDate: '2026-06-01',
		endDate: '2026-08-31',
		emails: ['qa-not-an-email']
	});
	await saveLease(page);
	await page.waitForTimeout(1500);
	console.log(
		'MALFORMED:',
		(await page.locator('form').innerText()).replace(/\n+/g, ' | ').slice(0, 500)
	);
	await expect(page.getByText(/qa-not-an-email/).first()).toBeVisible();
	await shot(page, 'leases-malformed-email');
	expect((await leaseIdsAt(page, propA)).length).toBe(0);
});
