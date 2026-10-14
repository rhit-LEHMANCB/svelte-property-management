import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
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
	newSession
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

let tctx: BrowserContext, actx: BrowserContext;
let tpage: Page, apage: Page;
test.beforeAll(async ({ browser }) => {
	({ ctx: tctx, page: tpage } = await newSession(browser, 'tenant'));
	({ ctx: actx, page: apage } = await newSession(browser, 'admin'));
});
test.afterAll(async () => {
	await tctx.close();
	await actx.close();
});

test('leases: Tenant lease card (current, month to month)', async () => {
	await tpage.goto('/');
	await ready(tpage);
	const card = tpage.getByRole('region', { name: 'Your lease' });
	console.log(
		'CARDS:',
		await card.count(),
		(await card.allInnerTexts()).join(' || ').replace(/\n+/g, ' | ')
	);
	await expect(card).toHaveCount(1);
	await expect(card.first()).toContainText('203 Lakeshore Dr');
	await expect(card.first()).toContainText('month to month');
	await expect(card.first()).toContainText('$2,000.00');
	await expect(card.first()).toContainText(/current/i);
	await shot(tpage, 'leases-tenant-lease-card-month-to-month');
});

test('leases: Document - tenant on the lease gets the PDF; other tenant 403; anonymous; admin', async ({
	browser
}) => {
	const { propA, leaseA1, leaseA2 } = loadState();
	// give A2 a document so a 403 for the tenant is about access, not a missing file
	await apage.goto(`/admin/properties/${propA}/leases/${leaseA2}`);
	await ready(apage);
	await apage
		.locator('input[name=document]')
		.setInputFiles({ name: 'qa-lease-a2.pdf', mimeType: 'application/pdf', buffer: PDF });
	await saveLease(apage);
	await apage.waitForTimeout(4000);
	const anyway = apage.getByRole('button', { name: 'Save anyway' });
	if (await anyway.isVisible()) await anyway.click();
	await apage.waitForTimeout(3000);
	await apage.goto(`/admin/properties/${propA}/leases/${leaseA2}`);
	await ready(apage);
	await expect(apage.getByRole('link', { name: 'View document' })).toBeVisible();

	const mine = await tpage.request.get(`/api/lease/${leaseA1}/document`);
	console.log(
		'TENANT own doc:',
		mine.status(),
		mine.headers()['content-type'],
		mine.headers()['cache-control'],
		(await mine.body()).subarray(0, 8).toString()
	);
	expect(mine.status()).toBe(200);
	expect(mine.headers()['content-type']).toContain('application/pdf');
	expect((await mine.body()).subarray(0, 5).toString()).toBe('%PDF-');
	await tpage.goto(`/api/lease/${leaseA1}/document`).catch(() => {});
	await shot(tpage, 'leases-document-tenant-on-the-lease');

	const other = await tpage.request.get(`/api/lease/${leaseA2}/document`);
	console.log('TENANT other lease doc:', other.status(), (await other.text()).slice(0, 200));
	expect(other.status()).toBe(403);
	await tpage.goto(`/api/lease/${leaseA2}/document`).catch(() => {});
	await shot(tpage, 'leases-document-other-tenant-403');

	const anon = await browser.newContext({ baseURL: 'https://lehman-realty-dev.web.app' });
	const ap = await anon.newPage();
	const anonRes = await anon.request.get(`/api/lease/${leaseA1}/document`, { maxRedirects: 0 });
	console.log(
		'ANON doc:',
		anonRes.status(),
		anonRes.headers()['location'] ?? '',
		(await anonRes.text()).slice(0, 200)
	);
	await ap.goto(`/api/lease/${leaseA1}/document`).catch(() => {});
	await shot(ap, 'leases-document-anonymous');
	await anon.close();
	expect([401, 302, 303, 403]).toContain(anonRes.status());

	const adminRes = await apage.request.get(`/api/lease/${leaseA2}/document`);
	console.log('ADMIN doc:', adminRes.status());
	expect(adminRes.status()).toBe(200);
});

test('rent-payments: /payment lists the ended lease and the current lease', async () => {
	await tpage.goto('/payment');
	await ready(tpage);
	const txt = await tpage
		.locator('main')
		.innerText()
		.catch(async () => await tpage.locator('body').innerText());
	console.log('PAYMENT:', txt.replace(/\n+/g, ' | ').slice(0, 800));
	await expect(tpage.getByText('$3,600.00')).toBeVisible();
	await expect(tpage.getByText('$2,000.00')).toBeVisible();
	await shot(tpage, 'rent-payments-ended-lease-and-current-lease-balances');
});

test('rent-payments: checkout API checks', async () => {
	const { leaseA1, leaseA2 } = loadState();
	const post = async (body: unknown) => {
		const r = await tpage.request.post('/api/stripe/create-checkout-session/payment', {
			data: body as object
		});
		return { status: r.status(), text: (await r.text()).slice(0, 160) };
	};
	const results: Record<string, unknown> = {};
	results['no leaseId'] = await post({ amount: 10 });
	results['unknown lease'] = await post({ leaseId: 'qa-nope', amount: 10 });
	results['not my lease (A2)'] = await post({ leaseId: leaseA2, amount: 10 });
	results['missing amount'] = await post({ leaseId: leaseA1 });
	results['non-numeric amount'] = await post({ leaseId: leaseA1, amount: 'abc' });
	results['above balance'] = await post({ leaseId: leaseA1, amount: 3600.01 });
	results['fractional cents'] = await post({ leaseId: leaseA1, amount: 10.005 });
	results['zero'] = await post({ leaseId: leaseA1, amount: 0 });
	results['negative'] = await post({ leaseId: leaseA1, amount: -5 });
	console.log('CHECKOUT RESULTS', JSON.stringify(results, null, 1));
	expect((results['no leaseId'] as any).status).toBe(403);
	expect((results['unknown lease'] as any).status).toBe(403);
	expect((results['not my lease (A2)'] as any).status).toBe(403);
	expect((results['missing amount'] as any).status).toBe(400);
	expect((results['non-numeric amount'] as any).status).toBe(400);
	expect((results['above balance'] as any).status).toBe(400);
	expect((results['fractional cents'] as any).status).toBe(400);
	expect((results['zero'] as any).status).toBe(400);
	saveState({ checkoutChecks: results });
});

test('rent-payments: tenant UI rejects an amount above the balance', async () => {
	await tpage.goto('/payment');
	await ready(tpage);
	const btns = tpage.getByRole('button', { name: /Make a Payment for/ });
	console.log(
		'PAY BUTTONS',
		await btns.allInnerTexts(),
		await btns.evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')))
	);
	await tpage.getByRole('button', { name: /Make a Payment for 101 QA Alpha St/ }).click();
	await tpage.getByRole('dialog').locator('input').fill('99999');
	await shot(tpage, 'rent-payments-payment-modal');
	await tpage.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
	await expect(tpage.getByText(/less than or equal to \$3,600\.00/)).toBeVisible({
		timeout: 10000
	});
	await shot(tpage, 'rent-payments-amount-above-balance-rejected');
});
