import { expect, test, type Page } from '@playwright/test';
import {
	CARD_LEASE,
	DEPOSIT_LEASE,
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
test.setTimeout(400_000);

let sessionId = '';
const pendingNotes = (page: Page, lease: string) => leaseCard(page, lease).locator('[data-bank-pending]');

/** Start a bank Checkout from the dialog, pay with a test account, and land on /payment/success. */
async function bankPayment(page: Page, lease: string, amount: string, account?: RegExp) {
	await openPayment(page);
	const dlg = await fillDialog(page, lease, amount, 'bank');
	await dlg.getByRole('button', { name: 'Continue to payment' }).click();
	await payWithTestBank(page, account);
	await pressPay(page);
	await page.waitForLoadState('networkidle');
	sessionId = new URL(page.url()).searchParams.get('bank') ?? sessionId;
	expect(new URL(page.url()).pathname).toBe('/payment/success');
	expect(sessionId).toMatch(/^cs_test_/);
	await expect(page.locator('p').first()).toContainText('Bank payments take a few business days to complete');
	await expect(page.locator('p').first()).toContainText('it shows as processing on your payment page');
	await expect(page.getByRole('link', { name: 'Back to payments' })).toHaveAttribute('href', '/payment');
	await shot(page, 'pending-bank-payments-return-from-bank-checkout');
	return sessionId;
}

// Test-mode bank payments settle a few minutes after they start, so the pending checks of each
// phase run straight after its payment. Phase A pays the whole $1,499.00 of CARD_LEASE; phase B pays
// $300.00 of DEPOSIT_LEASE ($1,500.00 owed). The spec is single-use: the leases' balances drop.

test('Checkout completed, not settled: pending record, success page and processing note', async ({
	page
}) => {
	await signInAs(page, 'tenant');
	await openPayment(page);
	await bankPayment(page, CARD_LEASE, '1499'); // asserts and screenshots the success page
	await page.getByRole('link', { name: 'Back to payments' }).click();
	await openPayment(page);
	const note = pendingNotes(page, CARD_LEASE);
	await expect(note).toHaveCount(1);
	await expect(note.first()).toContainText(/A bank payment of \$1,499\.00 started on\s+\d+\/\d+\/\d+ is processing\./);
	await expect(leaseCard(page, CARD_LEASE)).toContainText('You have a balance of $1,499.00');
	await shot(page, 'pending-bank-payments-checkout-completed-not-settled', leaseCard(page, CARD_LEASE));
	await shot(page, 'pending-bank-payments-processing-note', leaseCard(page, CARD_LEASE));
});

test('Everything on its way: balance is being paid and Make a Payment is disabled', async ({ page }) => {
	await signInAs(page, 'tenant');
	await openPayment(page);
	const card = leaseCard(page, CARD_LEASE);
	await expect(pendingNotes(page, CARD_LEASE)).toHaveCount(1);
	await expect(card.getByText('Your balance is being paid.')).toBeVisible();
	await expect(card.getByRole('button', { name: /Make a Payment/ })).toBeDisabled();
	expect((await createSession(page, CARD_LEASE, 0.01, 'card')).status).toBe(400);
	expect((await createSession(page, CARD_LEASE, 0.01, 'bank')).status).toBe(400);
	await shot(page, 'pending-bank-payments-everything-on-its-way', card);
});

test('Payable amount reduced: $1,200.00 of $1,500.00 can be paid, dialog and server', async ({ page }) => {
	await signInAs(page, 'tenant');
	await bankPayment(page, DEPOSIT_LEASE, '300');
	await openPayment(page);
	await expect(pendingNotes(page, DEPOSIT_LEASE)).toHaveCount(1);
	const dlg = await fillDialog(page, DEPOSIT_LEASE, '1200.01', 'card');
	await expect(dlg).toContainText('You can pay up to $1,200.00 now.');
	let posts = 0;
	page.on('request', (r) => r.url().includes('create-checkout-session') && posts++);
	await dlg.getByRole('button', { name: 'Continue to payment' }).click();
	await expect(dlg.getByRole('alert')).toContainText('no more than $1,200.00');
	expect(posts).toBe(0);
	await shot(page, 'pending-bank-payments-payable-amount-reduced', dlg);
	expect((await createSession(page, DEPOSIT_LEASE, 1200.01, 'bank')).status).toBe(400);
	expect((await createSession(page, DEPOSIT_LEASE, 1200.01, 'card')).status).toBe(400);
	expect((await createSession(page, DEPOSIT_LEASE, 1200, 'bank')).status).toBe(200);
	// A co-tenant cannot be tested (one QA tenant); the note and the cap are per lease.
	await expect(leaseCard(page, DEPOSIT_LEASE)).toContainText('You have a balance of $1,500.00');
});

test('Returned before the event: revisiting the success URL leaves one record', async ({ page }) => {
	expect(sessionId).toMatch(/^cs_test_/);
	await signInAs(page, 'tenant');
	for (let i = 0; i < 2; i++) {
		await page.goto(`/payment/success?bank=${sessionId}`);
		await page.waitForLoadState('networkidle');
	}
	await openPayment(page);
	await expect(pendingNotes(page, DEPOSIT_LEASE)).toHaveCount(1);
	await shot(page, 'pending-bank-payments-returned-before-the-event', leaseCard(page, DEPOSIT_LEASE));
});

test('Not the tenant session: another user, a card session and a made-up id create nothing', async ({
	browser,
	page
}) => {
	await signInAs(page, 'tenant');
	await bankPayment(page, DEPOSIT_LEASE, '20'); // a fresh pending payment: they settle within minutes
	await openPayment(page);
	expect(sessionId).toMatch(/^cs_test_/);
	// A card Checkout session of this app (not a bank payment session), and a made-up id.
	const card = await createSession(page, DEPOSIT_LEASE, 5, 'card');
	const cardSession = card.url!.match(/cs_test_[A-Za-z0-9]+/)![0];
	for (const id of [cardSession, 'cs_test_madeupmadeupmadeup', 'not-a-session']) {
		const res = await page.goto(`/payment/success?bank=${id}`);
		expect(res?.status(), id).toBeLessThan(500);
	}
	await openPayment(page);
	await expect(pendingNotes(page, DEPOSIT_LEASE)).toHaveCount(1); // only the $20.00 payment
	await shot(page, 'pending-bank-payments-not-the-tenant-session-tenant', leaseCard(page, DEPOSIT_LEASE));

	// The admin opens the tenant's real session: nothing is created or changed.
	const ctx = await browser.newContext();
	const adminPage = await ctx.newPage();
	await signInAs(adminPage, 'admin');
	await adminPage.goto(`/payment/success?bank=${sessionId}`);
	await adminPage.waitForLoadState('networkidle');
	await shot(adminPage, 'pending-bank-payments-not-the-tenant-session-admin');
	await ctx.close();
	await openPayment(page);
	await expect(pendingNotes(page, DEPOSIT_LEASE)).toHaveCount(1);
});

test('Server only: a tenant cannot read or write bank_payments in Firestore', async ({ page }) => {
	// Capture the public web API key from the sign-in requests the app itself makes.
	let key = '';
	page.on('request', (r) => {
		const m = r.url().match(/[?&]key=(AIza[0-9A-Za-z_-]+)/);
		if (m) key = m[1];
	});
	await signInAs(page, 'tenant');
	await page.waitForLoadState('networkidle');
	expect(key, 'public web API key seen in sign-in traffic').not.toBe('');
	const auth = await page.request.post(
		`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`,
		{ data: { email: process.env.QA_TENANT_EMAIL, password: process.env.QA_TENANT_PASSWORD, returnSecureToken: true } }
	);
	expect(auth.status()).toBe(200);
	const { idToken } = await auth.json();
	const base = `https://firestore.googleapis.com/v1/projects/lehman-realty-dev/databases/(default)/documents/leases/${DEPOSIT_LEASE}/bank_payments`;
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

test('Settles: the processing note goes away and the balance drops', async ({ page }) => {
	await signInAs(page, 'tenant');
	let done = false;
	for (let i = 0; i < 24 && !done; i++) {
		await openPayment(page);
		done = (await pendingNotes(page, DEPOSIT_LEASE).count()) === 0;
		if (done) break;
		if (!done) await page.waitForTimeout(15_000);
	}
	await shot(page, 'pending-bank-payments-settles', leaseCard(page, DEPOSIT_LEASE));
	expect(done, 'pending note gone within 6 minutes').toBe(true);
	await expect(leaseCard(page, DEPOSIT_LEASE)).toContainText('You have a balance of $1,180.00');
});

test('Failed bank payment: failure note, amount payable again (needs the failure event)', async ({ page }) => {
	await signInAs(page, 'tenant');
	await openPayment(page);
	await bankPayment(page, DEPOSIT_LEASE, '50', /Insufficient Funds/);
	// Poll /payment for up to ~4 minutes for the failure to register.
	let failed = false;
	for (let i = 0; i < 16 && !failed; i++) {
		await openPayment(page);
		failed = (await leaseCard(page, DEPOSIT_LEASE).locator('[data-bank-failed]').count()) > 0;
		if (!failed) await page.waitForTimeout(15_000);
	}
	await shot(page, 'pending-bank-payments-failed-bank-payment', leaseCard(page, DEPOSIT_LEASE));
	expect(failed, 'failure note shown within 4 minutes').toBe(true);
	await expect(leaseCard(page, DEPOSIT_LEASE).locator('[data-bank-failed]')).toContainText('did not go through. The amount is still owed.');
	await expect(leaseCard(page, DEPOSIT_LEASE).getByRole('button', { name: /Make a Payment/ })).toBeEnabled();
	await shot(page, 'pending-bank-payments-failure-note', leaseCard(page, DEPOSIT_LEASE));
});
