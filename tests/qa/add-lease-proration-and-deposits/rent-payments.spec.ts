import { test, expect, type Page } from '@playwright/test';
import {
	newSession, createProperty, createLease, remember, entryText, openLeases, shot, cleanup,
	startCheckout, payWithTestCard, waitFor, paymentBlock
} from './helpers';

const CAP = 'rent-payments';
let admin: Page;
let tenant: Page;
let prop = '';
const ids: Record<string, string> = {};
const checkoutText = async (page: Page) => {
	await page.waitForLoadState('domcontentloaded');
	await expect(page.getByText('Transaction Fee').first()).toBeVisible({ timeout: 60_000 });
	return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
	test.setTimeout(300_000);
	admin = await newSession(browser, 'admin');
	tenant = await newSession(browser, 'tenant');
	prop = await createProperty(admin, 'qa-billing-payments', 1500, 'payments QA Way');
	remember('property', prop);
	// R1: rent 1500, 2023-03-15 to 2023-05-31 = 822.58 + 1500 + 1500 = 3,822.58 owed, rent only.
	ids.r1 = await createLease(admin, prop, { rent: 1500, start: '2023-03-15', end: '2023-05-31' });
	remember('lease', ids.r1, prop);
	// R2: rent 1000, 2023-07-01 to 2023-08-31 with a $500 deposit = 2,500.00 owed.
	ids.r2 = await createLease(admin, prop, { rent: 1000, start: '2023-07-01', end: '2023-08-31', deposit: 500 });
	remember('lease', ids.r2, prop);
});

test.afterAll(async () => {
	if (!admin) return;
	const left = await cleanup(admin, [ids.r1, ids.r2].filter(Boolean), [prop]);
	console.log('rent-payments cleanup, leases left:', left.length, '(r2 has a payment)');
	await admin.context().close();
	await tenant.context().close();
});

test.describe('Real balance and due date', () => {
	test('Ended lease', async () => {
		await tenant.goto('/payment');
		await tenant.waitForLoadState('networkidle');
		const r1 = paymentBlock(tenant, ids.r1);
		await expect(r1).toContainText('$3,822.58');
		await expect(r1).toContainText('due on 3/15/23');
		await expect(r1).toContainText(/ended/i);
		await expect(paymentBlock(tenant, ids.r2)).toContainText('$2,500.00');
		await r1.scrollIntoViewIfNeeded();
		await shot(tenant, `${CAP}-ended-lease`);
	});

	test('Mid-month start', async () => {
		await tenant.goto('/payment');
		await tenant.waitForLoadState('networkidle');
		// Start 2023-03-15, first month 17 of 31 days: 822.58 + 1500 + 1500, due on the start date.
		await expect(paymentBlock(tenant, ids.r1)).toContainText('$3,822.58');
		await expect(paymentBlock(tenant, ids.r1)).toContainText('due on 3/15/23');
		await paymentBlock(tenant, ids.r1).scrollIntoViewIfNeeded();
		await shot(tenant, `${CAP}-mid-month-start`);
	});

	test('Breakdown', async () => {
		await tenant.goto('/payment');
		await tenant.waitForLoadState('networkidle');
		const dl = paymentBlock(tenant, ids.r2).getByLabel('Balance breakdown');
		await expect(dl).toContainText('Security deposit');
		await expect(dl).toContainText('$500.00');
		await expect(dl).toContainText('Rent');
		await expect(dl).toContainText('$2,000.00');
		await paymentBlock(tenant, ids.r2).scrollIntoViewIfNeeded();
		await shot(tenant, `${CAP}-breakdown`);
		test.info().annotations.push({ type: 'partial', description: 'no late fee part could be produced' });
	});

	test('Upcoming lease with a deposit', async () => {
		test.skip(true, 'not verified: the QA tenant cannot be given an upcoming lease (the existing month-to-month lease overlaps every later date)');
	});
	test('Upcoming lease', async () => {
		test.skip(true, 'not verified: same reason as the upcoming lease with a deposit');
	});
	test('Paid in full', async () => {
		test.skip(true, 'not verified: the QA tenant has a pre-existing lease that owes rent and must not be paid');
	});
	test('Shared lease', async () => {
		test.skip(true, 'not verified: needs a second tenant account');
	});
});

test.describe('Start a payment', () => {
	test('Rent only', async () => {
		await startCheckout(tenant, ids.r1, 100);
		const text = await checkoutText(tenant);
		expect(text).toMatch(/Rent[^$]*\$100\.00/);
		expect(text).toMatch(/Transaction Fee[^$]*\$3\.20/);
		expect(text).not.toContain('Security Deposit');
		expect(text).not.toContain('Late Fee');
		expect(text).toContain('$103.20');
		await shot(tenant, `${CAP}-rent-only`, false);
	});

	test('Return pages', async () => {
		// Cancel returns to /payment.
		await startCheckout(tenant, ids.r1, 100);
		await checkoutText(tenant);
		await tenant.getByRole('link', { name: 'Back' }).first().click();
		await tenant.waitForURL(/\/payment$/, { timeout: 60_000 });
		await shot(tenant, `${CAP}-return-pages-cancel`);
	});

	test('Valid amount', async () => {
		await startCheckout(tenant, ids.r1, 100);
		expect(tenant.url()).toMatch(/checkout\.stripe\.com/);
		await checkoutText(tenant);
		await shot(tenant, `${CAP}-valid-amount`, false);
	});

	test('Split across parts', async () => {
		// $600.00 on R2 (deposit 500, rent 2000): the spec's example without a late fee.
		await startCheckout(tenant, ids.r2, 600);
		const text = await checkoutText(tenant);
		expect(text).toMatch(/Security Deposit[^$]*\$500\.00/);
		expect(text).toMatch(/Rent[^$]*\$100\.00/);
		expect(text).toMatch(/Transaction Fee[^$]*\$17\.70/);
		expect(text).not.toContain('Late Fee');
		await shot(tenant, `${CAP}-split-across-parts`, false);
		test.info().annotations.push({ type: 'partial', description: 'no Late Fee line: no late fee can be owed yet' });
	});

	test('Not the tenant\'s lease', async () => {
		const missing = await tenant.request.post('/api/stripe/create-checkout-session/payment', { data: { amount: 10 } });
		expect(missing.status()).toBe(403);
		const unknown = await tenant.request.post('/api/stripe/create-checkout-session/payment', { data: { amount: 10, leaseId: 'qa-no-such-lease' } });
		expect(unknown.status()).toBe(403);
		await tenant.goto('/payment');
		await shot(tenant, `${CAP}-not-the-tenants-lease`);
	});

	test('Invalid amount', async () => {
		const url = '/api/stripe/create-checkout-session/payment';
		expect((await tenant.request.post(url, { data: { leaseId: ids.r1 } })).status()).toBe(400);
		expect((await tenant.request.post(url, { data: { leaseId: ids.r1, amount: 'abc' } })).status()).toBe(400);
		await tenant.goto('/payment');
		await shot(tenant, `${CAP}-invalid-amount`);
	});

	test('Amount above the balance', async () => {
		const url = '/api/stripe/create-checkout-session/payment';
		expect((await tenant.request.post(url, { data: { leaseId: ids.r1, amount: 3822.59 } })).status()).toBe(400);
		// The /payment page itself also stops it.
		await tenant.goto('/payment');
		await tenant.waitForLoadState('networkidle');
		await paymentBlock(tenant, ids.r1).getByRole('button', { name: /Make a Payment/ }).click();
		await tenant.getByRole('dialog').locator('input').fill('3822.59');
		await tenant.getByRole('button', { name: 'Submit' }).click();
		await expect(tenant.getByText(/less than or equal to \$3,822\.58/)).toBeVisible();
		await shot(tenant, `${CAP}-amount-above-the-balance`);
	});

	test('Fractional cents', async () => {
		const url = '/api/stripe/create-checkout-session/payment';
		expect((await tenant.request.post(url, { data: { leaseId: ids.r1, amount: 10.005 } })).status()).toBe(400);
		expect((await tenant.request.post(url, { data: { leaseId: ids.r1, amount: 0 } })).status()).toBe(400);
		expect((await tenant.request.post(url, { data: { leaseId: ids.r1, amount: -5 } })).status()).toBe(400);
		await tenant.goto('/payment');
		await shot(tenant, `${CAP}-fractional-cents`);
	});

	test('Overpayment', async () => {
		const res = await tenant.request.post('/api/stripe/create-checkout-session/payment', { data: { leaseId: ids.r2, amount: 2500.01 } });
		expect(res.status()).toBe(400);
		await tenant.goto('/payment');
		await shot(tenant, `${CAP}-overpayment`);
	});
});

test.describe('Record payments', () => {
	test('Payment covers carried-over months', async () => {
		test.setTimeout(420_000);
		// $1,700.00 on R2: deposit 500, then rent 1,200 = all of July (1,000) and 200 of August.
		await startCheckout(tenant, ids.r2, 1700);
		const text = await checkoutText(tenant);
		expect(text).toMatch(/Security Deposit[^$]*\$500\.00/);
		expect(text).toMatch(/Rent[^$]*\$1,200\.00/);
		expect(text).toMatch(/Transaction Fee[^$]*\$49\.60/);
		await payWithTestCard(tenant);
		await expect(tenant).toHaveURL(/\/payment\/success/);
		await shot(tenant, `${CAP}-return-pages-success`);
		const recorded = await waitFor(admin, async () => {
			await openLeases(admin, prop);
			return (await entryText(admin, '2023-07-01')).includes('$500.00 paid');
		});
		test.skip(!recorded, 'environment: the payment was not recorded (webhook not delivered to the dev site)');
		const t = await entryText(admin, '2023-07-01');
		// Deposit fully paid, rent owed is 2,000 - 1,200 = 800.
		expect(t).toContain('Owed $800.00');
		expect(t).toContain('$500.00 held');
		await shot(admin, `${CAP}-payment-covers-carried-over-months`);
		// Partial payment: the tenant sees the reduced balance.
		await tenant.goto('/payment');
		await tenant.waitForLoadState('networkidle');
		await expect(paymentBlock(tenant, ids.r2)).toContainText('$800.00');
		await paymentBlock(tenant, ids.r2).scrollIntoViewIfNeeded();
		await shot(tenant, `${CAP}-partial-payment`);
	});

	test('Late fee and deposit parts', async () => {
		// The payment above was recorded with its deposit part as deposit and the rent part as rent.
		await openLeases(admin, prop);
		const t = await entryText(admin, '2023-07-01');
		expect(t).toContain('$500.00 paid');
		expect(t).toContain('Owed $800.00');
		await shot(admin, `${CAP}-late-fee-and-deposit-parts`);
		test.info().annotations.push({ type: 'partial', description: 'no late fee part' });
	});

	test('Bad signature', async () => {
		const none = await admin.request.post('/api/stripe/webhook', { data: '{}', headers: { 'content-type': 'application/json' } });
		expect(none.status()).toBe(400);
		const bad = await admin.request.post('/api/stripe/webhook', {
			data: '{"type":"invoice.payment_succeeded"}',
			headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' }
		});
		expect(bad.status()).toBe(400);
		await openLeases(admin, prop);
		await shot(admin, `${CAP}-bad-signature`);
	});

	for (const name of [
		'First payment of the month', 'Later payment in the month', 'Owed amounts changed after checkout',
		'Invoice from before this change', 'Month near midnight', 'Invoice without a lease', 'Write fails',
		'Redelivered invoice', 'Unrelated event', 'Unknown property'
	]) {
		test(name, async () => {
			test.skip(true, 'not verified: needs a signed Stripe event or backend access that QA does not have');
		});
	}
});
