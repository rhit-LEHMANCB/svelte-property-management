import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { ready, loadState, shot, newSession } from './helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

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

test('access-control: One property - tenant with a current lease sees that property everywhere', async () => {
	await tpage.goto('/');
	await ready(tpage);
	await expect(tpage.getByText('No property is assigned to your account yet.')).toHaveCount(0);
	await expect(tpage.getByText('203 Lakeshore Dr, Batesville').first()).toBeVisible();
	await shot(tpage, 'access-control-one-property-dashboard');
	await tpage.goto('/maintenance');
	await ready(tpage);
	await expect(tpage).toHaveURL(/\/maintenance$/);
	await expect(tpage.getByRole('button', { name: 'Add' })).toBeVisible();
	await shot(tpage, 'maintenance-requests-tenant-with-current-lease-can-open-the-form');
	await tpage.goto('/payment');
	await ready(tpage);
	await expect(tpage).toHaveURL(/\/payment$/);
	await shot(tpage, 'access-control-payment-loads-with-a-current-lease');
	for (const p of ['/profile', '/insurance']) {
		await tpage.goto(p);
		await ready(tpage);
		await expect(tpage).toHaveURL(new RegExp(`${p}$`));
	}
	await shot(tpage, 'access-control-profile-and-insurance-load');
});

test('access-control: Lease visibility - another household lease', async () => {
	const { propA, leaseA2 } = loadState();
	const doc = await tpage.request.get(`/api/lease/${leaseA2}/document`);
	const pay = await tpage.request.post('/api/stripe/create-checkout-session/payment', {
		data: { leaseId: leaseA2, amount: 5 }
	});
	console.log(
		'LEASE VISIBILITY doc/pay:',
		doc.status(),
		(await doc.text()).slice(0, 100),
		pay.status(),
		(await pay.text()).slice(0, 100)
	);
	expect(doc.status()).toBe(403);
	expect(pay.status()).toBe(403);
	const r = await tpage.goto(`/admin/properties/${propA}/leases/${leaseA2}`);
	console.log('TENANT opens admin lease page:', r?.status(), tpage.url());
	const body = (await tpage.locator('body').innerText()).slice(0, 300).replace(/\n+/g, ' | ');
	console.log('TENANT lease page body:', body);
	expect(body).not.toContain('qa-');
	await shot(tpage, 'access-control-lease-visibility-another-households-lease');
});

test('access-control: Admin-only - tenant calls admin endpoints', async () => {
	const { propA, leaseA2 } = loadState();
	const del = await tpage.request.delete(`/api/lease/${leaseA2}`);
	const delBody = await del.text();
	console.log('TENANT DELETE lease:', del.status(), delBody.slice(0, 120));
	expect(del.status()).toBe(401);
	expect(delBody).toContain('You must be an admin to do this.');
	const add = await tpage.request.post('/api/user/add', {
		data: { email: 'qa-should-not-exist@example.com' }
	});
	console.log('TENANT POST /api/user/add:', add.status(), (await add.text()).slice(0, 120));
	expect(add.status()).toBe(401);
	const pageRes = await tpage.goto(`/admin/properties/${propA}/leases/new`);
	console.log(
		'TENANT lease form page:',
		pageRes?.status(),
		tpage.url(),
		(await tpage.locator('body').innerText()).slice(0, 200).replace(/\n+/g, ' | ')
	);
	await shot(tpage, 'access-control-admin-only-tenant-blocked-from-the-lease-form');
	// the lease must still exist
	await apage.goto(`/admin/properties/${propA}/edit?tab=leases`);
	await ready(apage);
	await expect(
		apage
			.getByRole('list', { name: 'Leases' })
			.locator(':scope > li')
			.filter({ hasText: '2026-09-01' })
	).toHaveCount(1);
	// the tenant did not create a user
	await apage.goto('/admin/users');
	await ready(apage);
	await expect(apage.getByText('qa-should-not-exist@example.com')).toHaveCount(0);
});

test('access-control: Anonymous caller', async ({ browser }) => {
	const { leaseA2 } = loadState();
	const anon = await browser.newContext({ baseURL: 'https://lehman-realty-dev.web.app' });
	const del = await anon.request.delete(`/api/lease/${leaseA2}`);
	const t = await del.text();
	console.log('ANON DELETE lease:', del.status(), t.slice(0, 120));
	expect(del.status()).toBe(401);
	expect(t).toContain('You must be logged in to do this.');
	const add = await anon.request.post('/api/user/add', {
		data: { email: 'qa-should-not-exist@example.com' }
	});
	expect(add.status()).toBe(401);
	const co = await anon.request.post('/api/stripe/create-checkout-session/payment', {
		data: { leaseId: leaseA2, amount: 5 }
	});
	console.log('ANON checkout:', co.status());
	const p = await anon.newPage();
	await p.goto('/api/lease/' + leaseA2);
	await p.screenshot({
		path: 'openspec/changes/add-leases/qa/screenshots/access-control-anonymous-caller.png'
	});
	await anon.close();
});

test('firebase-configuration: Lease documents are private (direct storage read denied)', async ({
	browser
}) => {
	const { leaseA1 } = loadState();
	const bucket = 'lehman-realty-dev.appspot.com';
	const url = (p: string, q = 'alt=media') =>
		`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(p)}?${q}`;
	const ctx = await browser.newContext();
	const leasePath = `leases/${leaseA1}/qa-lease-a1-v2.pdf`;
	const r1 = await ctx.request.get(url(leasePath));
	const r2 = await ctx.request.get(url(`leases/${leaseA1}/document.pdf`));
	const r3 = await ctx.request.get(
		`https://firebasestorage.googleapis.com/v0/b/${bucket}/o?prefix=${encodeURIComponent('leases/')}`
	);
	const pub = await ctx.request.get(url('properties/qa-nonexistent/x.jpg'));
	const usr = await ctx.request.get(url('users/qa-nonexistent/x.jpg'));
	console.log(
		'STORAGE leases get:',
		r1.status(),
		r2.status(),
		'| list leases/:',
		r3.status(),
		'| properties/ (absent object):',
		pub.status(),
		'| users/ (absent object):',
		usr.status()
	);
	expect(r1.status()).toBe(403);
	expect(r2.status()).toBe(403);
	expect(r3.status()).toBe(403);
	// a path under properties/ or users/ passes the rules (404 = allowed but absent), which shows the 403 is the rule, not a missing file
	expect(pub.status()).toBe(404);
	expect(usr.status()).toBe(404);
	const p = await ctx.newPage();
	await p.goto(url(leasePath));
	await p.screenshot({
		path: 'openspec/changes/add-leases/qa/screenshots/firebase-configuration-lease-documents-are-private.png'
	});
	await ctx.close();
});
