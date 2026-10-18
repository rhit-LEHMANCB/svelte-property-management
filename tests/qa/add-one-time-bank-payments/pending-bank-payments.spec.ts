import { expect, test, type Page } from '@playwright/test';
import {
	DEPOSIT_LEASE as L,
	createSession,
	fillDialog,
	leaseCard,
	openPayment,
	payWithTestBank,
	pressPay,
	shot,
	signInAs
} from './support';

test.describe.configure({ mode: 'serial' });
test.setTimeout(1_600_000);

let sessionId = '';
let balance = 0; // lease balance shown (cents) before this spec pays anything
const money = (c: number) => (c / 100).toFixed(2);
const fmt = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
const notes = (page: Page) => leaseCard(page, L).locator('[data-bank-pending]');

async function readBalance(page: Page) {
	const t = await leaseCard(page, L).innerText();
	const m = t.match(/balance of \$([\d,]+\.\d\d)/)!;
	return Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
}

async function bankPayment(page: Page, amount: string, account?: RegExp, slug?: string) {
	await openPayment(page);
	const dlg = await fillDialog(page, L, amount, 'bank');
	await dlg.getByRole('button', { name: 'Continue to payment' }).click();
	await payWithTestBank(page, account);
	await pressPay(page);
	await page.waitForLoadState('networkidle');
	sessionId = new URL(page.url()).searchParams.get('bank') ?? '';
	expect(new URL(page.url()).pathname).toBe('/payment/success');
	expect(sessionId).toMatch(/^cs_test_/);
	await expect(page.locator('p').first()).toContainText(
		'Bank payments take a few business days to complete'
	);
	await expect(page.locator('p').first()).toContainText(
		'it shows as processing on your payment page'
	);
	await expect(page.getByRole('link', { name: 'Back to payments' })).toHaveAttribute(
		'href',
		'/payment'
	);
	if (slug) await shot(page, slug);
	return sessionId;
}

// Phase 1: a $5 bank payment on the Insufficient Funds account. While it is pending the cap checks run.
test('Phase 1: $5 Insufficient Funds payment is pending; cap reduced; note shown', async ({
	page
}) => {
	await signInAs(page, 'tenant');
	await openPayment(page);
	balance = await readBalance(page);
	console.log('BALANCE_BEFORE', balance);
	await bankPayment(
		page,
		'5',
		/Insufficient Funds/,
		'pending-bank-payments-return-from-bank-checkout'
	);
	await openPayment(page);
	await expect(notes(page)).toHaveCount(2); // the old $50.00 one stays, plus this one
	await expect(notes(page).filter({ hasText: 'A bank payment of $5.00 started on' })).toContainText(
		/A bank payment of \$5\.00 started\s+on\s+\d+\/\d+\/\d+ is processing\./
	);
	await expect(leaseCard(page, L)).toContainText(`You have a balance of ${fmt(balance)}`);
	await shot(page, 'pending-bank-payments-checkout-completed-not-settled', leaseCard(page, L));
	await shot(page, 'pending-bank-payments-processing-note', leaseCard(page, L));
	// cap = balance - 50.00 - 5.00
	const cap = balance - 5500;
	const dlg = await fillDialog(page, L, money(cap + 1), 'card');
	await expect(dlg).toContainText(`You can pay up to ${fmt(cap)} now.`);
	let posts = 0;
	page.on('request', (r) => r.url().includes('create-checkout-session') && posts++);
	await dlg.getByRole('button', { name: 'Continue to payment' }).click();
	await expect(dlg.getByRole('alert')).toContainText(`no more than ${fmt(cap)}`);
	expect(posts).toBe(0);
	await shot(page, 'pending-bank-payments-payable-amount-reduced', dlg);
	expect((await createSession(page, L, (cap + 1) / 100, 'bank')).status).toBe(400);
	expect((await createSession(page, L, (cap + 1) / 100, 'card')).status).toBe(400);
	expect((await createSession(page, L, cap / 100, 'bank')).status).toBe(200);
});

test('Returned before the event: revisiting the success URL leaves one record', async ({
	page
}) => {
	await signInAs(page, 'tenant');
	for (let i = 0; i < 2; i++) {
		await page.goto(`/payment/success?bank=${sessionId}`);
		await page.waitForLoadState('networkidle');
	}
	await openPayment(page);
	const n = await notes(page).count();
	console.log('NOTES_AFTER_REVISIT', n);
	await expect(notes(page).filter({ hasText: 'bank payment of $5.00' })).toHaveCount(
		n === 1 ? 1 : 1
	);
	await shot(page, 'pending-bank-payments-returned-before-the-event', leaseCard(page, L));
});

async function notTenantSession(browser: import('@playwright/test').Browser, page: Page) {
	await openPayment(page);
	const before = await notes(page).count();
	const card = await createSession(page, L, 5, 'card');
	const cardSession = card.url!.match(/cs_test_[A-Za-z0-9]+/)![0];
	for (const id of [cardSession, 'cs_test_madeupmadeupmadeup', 'not-a-session']) {
		const res = await page.goto(`/payment/success?bank=${id}`);
		expect(res?.status(), id).toBeLessThan(500);
	}
	await openPayment(page);
	await expect(notes(page).count()).resolves.toBeLessThanOrEqual(before);
	await shot(page, 'pending-bank-payments-not-the-tenant-session-tenant', leaseCard(page, L));
	const ctx = await browser.newContext();
	const adminPage = await ctx.newPage();
	await signInAs(adminPage, 'admin');
	await adminPage.goto(`/payment/success?bank=${sessionId}`);
	await adminPage.waitForLoadState('networkidle');
	await shot(adminPage, 'pending-bank-payments-not-the-tenant-session-admin');
	await ctx.close();
	await openPayment(page);
	await expect(notes(page).count()).resolves.toBeLessThanOrEqual(before);
}

test('Not the tenant session (phase 1 session)', async ({ browser, page }) => {
	await signInAs(page, 'tenant');
	await notTenantSession(browser, page);
});

test('Server only: a tenant cannot read or write bank_payments in Firestore', async ({ page }) => {
	let key = '';
	page.on('request', (r) => {
		const m = r.url().match(/[?&]key=(AIza[0-9A-Za-z_-]+)/);
		if (m) key = m[1];
	});
	await signInAs(page, 'tenant');
	await page.waitForLoadState('networkidle');
	expect(key).not.toBe('');
	const auth = await page.request.post(
		`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`,
		{
			data: {
				email: process.env.QA_TENANT_EMAIL,
				password: process.env.QA_TENANT_PASSWORD,
				returnSecureToken: true
			}
		}
	);
	expect(auth.status()).toBe(200);
	const { idToken } = await auth.json();
	const base = `https://firestore.googleapis.com/v1/projects/lehman-realty-dev/databases/(default)/documents/leases/${L}/bank_payments`;
	const headers = { Authorization: `Bearer ${idToken}` };
	const read = await page.request.get(base, { headers });
	const write = await page.request.post(`${base}?documentId=qa-write-test`, {
		headers,
		data: { fields: { note: { stringValue: 'qa' } } }
	});
	console.log('Firestore client read status', read.status(), 'write status', write.status());
	expect([403, 401]).toContain(read.status());
	expect([403, 401]).toContain(write.status());
	await openPayment(page);
	await shot(page, 'pending-bank-payments-server-only');
});

// Phase 1 outcome: poll up to ~20 minutes for the failure.
test('Failed bank payment: failure note, amount payable again', async ({ page }) => {
	await signInAs(page, 'tenant');
	if (!balance) {
		await openPayment(page);
		balance = await readBalance(page);
	}
	let failed = false;
	const t0 = Date.now();
	for (let i = 0; i < 80 && !failed; i++) {
		await openPayment(page);
		failed = (await leaseCard(page, L).locator('[data-bank-failed]').count()) > 0;
		if (!failed) await page.waitForTimeout(15_000);
	}
	console.log('FAILED_AFTER_SECONDS', Math.round((Date.now() - t0) / 1000), failed);
	await shot(page, 'pending-bank-payments-failed-bank-payment', leaseCard(page, L));
	expect(failed, 'failure note shown within ~20 minutes').toBe(true);
	const card = leaseCard(page, L);
	await expect(card.locator('[data-bank-failed]')).toContainText(
		/bank payment of \$5\.00 started\s+on\s+\d+\/\d+\/\d+ did not go through\. The amount is still owed\./
	);
	await expect(notes(page).filter({ hasText: 'bank payment of $5.00' })).toHaveCount(0);
	await expect(card.getByRole('button', { name: /Make a Payment/ })).toBeEnabled();
	await expect(card).toContainText(`You have a balance of ${fmt(balance)}`); // no fee, nothing recorded
	const dlg = await fillDialog(page, L, money(balance - 5000), 'bank'); // only the old $50.00 still held
	await expect(dlg).toContainText(`You can pay up to ${fmt(balance - 5000)} now.`);
	await shot(page, 'pending-bank-payments-failure-note', card);
	await shot(page, 'pending-bank-payments-amount-payable-again', dlg);
});

// Phase 2: a $10 payment on the Success account settles.
test('Settles: processing note goes away, balance drops by the amount only', async ({
	browser,
	page
}) => {
	await signInAs(page, 'tenant');
	if (!balance) {
		await openPayment(page);
		balance = await readBalance(page);
	}
	await bankPayment(page, '10', /Success\s*••••6789/);
	await notTenantSession(browser, page);
	await openPayment(page);
	await expect(notes(page).filter({ hasText: 'bank payment of $10.00' })).toHaveCount(1);
	let done = false;
	for (let i = 0; i < 80 && !done; i++) {
		await openPayment(page);
		done = (await notes(page).filter({ hasText: 'bank payment of $10.00' }).count()) === 0;
		if (!done) await page.waitForTimeout(15_000);
	}
	await shot(page, 'pending-bank-payments-settles', leaseCard(page, L));
	expect(done, 'pending note gone within ~20 minutes').toBe(true);
	await expect(leaseCard(page, L)).toContainText(`You have a balance of ${fmt(balance - 1000)}`);
});
