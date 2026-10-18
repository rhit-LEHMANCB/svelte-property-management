import { expect, test } from '@playwright/test';
import {
	CARD_LEASE,
	DEPOSIT_LEASE,
	RENT_LEASE,
	createSession,
	fillDialog,
	leaseCard,
	openCheckout,
	openPayment,
	pressPay,
	shot,
	signInAs
} from './support';

test.setTimeout(150_000);
test.describe.configure({ mode: 'default' });

test.beforeEach(async ({ page }) => {
	await signInAs(page, 'tenant');
});

const line = (text: string, label: string, amount: string) =>
	expect(text).toMatch(new RegExp(`${label}[^$]*\\${amount.replace('.', '\\.')}`));

test('Valid amount: lines and Checkout URL', async ({ page }) => {
	const { status, url } = await createSession(page, DEPOSIT_LEASE, 600, 'card');
	expect(status).toBe(200);
	expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
	const text = await openCheckout(page, url!);
	line(text, 'Security Deposit', '$180.00');
	line(text, 'Rent', '$420.00');
	line(text, 'Transaction Fee', '$18.00');
	expect(text).not.toContain('Late Fee');
	await shot(page, 'rent-payments-valid-amount');
});

test('Card: $964.52 fee is $28.94 and only cards are offered', async ({ page }) => {
	const { status, url } = await createSession(page, DEPOSIT_LEASE, 964.52, 'card');
	expect(status).toBe(200);
	const text = await openCheckout(page, url!);
	line(text, 'Transaction Fee', '$28.94');
	expect(text).toContain('$993.46');
	expect(text).toMatch(/Payment method Card/);
	expect(text).not.toMatch(/US bank account|Cash App/i);
	await shot(page, 'rent-payments-card');
});

test('Bank account: $964.52 fee is $5.00 and only a US bank account is offered', async ({
	page
}) => {
	const { status, url } = await createSession(page, DEPOSIT_LEASE, 964.52, 'bank');
	expect(status).toBe(200);
	const text = await openCheckout(page, url!);
	line(text, 'Transaction Fee', '$5.00');
	expect(text).toContain('$969.52');
	expect(text).toMatch(/Payment method US bank account/);
	expect(text).not.toMatch(/Cash App|Card number/i);
	expect(text).toMatch(/Enter bank details manually/);
	await shot(page, 'rent-payments-bank-account');
	// Bank fee is flat: $5.00 on a tiny amount too.
	const small = await createSession(page, DEPOSIT_LEASE, 1, 'bank');
	const smallText = await openCheckout(page, small.url!);
	line(smallText, 'Transaction Fee', '$5.00');
});

test('Missing or unknown method answers 400', async ({ page }) => {
	for (const method of [undefined, '', 'paypal', 'cashapp', 'CARD', 5, null]) {
		const r = await createSession(page, DEPOSIT_LEASE, 10, method);
		expect(r.status, `method ${String(method)}`).toBe(400);
		expect(r.url).toBeUndefined();
	}
	await openPayment(page);
	await shot(page, 'rent-payments-missing-or-unknown-method');
});

test('Split across parts: deposit, rent and fee lines', async ({ page }) => {
	// No QA lease owes a late fee, so the late fee part of the example is not covered.
	const { url } = await createSession(page, DEPOSIT_LEASE, 600, 'card');
	const text = await openCheckout(page, url!);
	line(text, 'Security Deposit', '$180.00');
	line(text, 'Rent', '$420.00');
	line(text, 'Transaction Fee', '$18.00');
	expect(text).toContain('$618.00');
	await shot(page, 'rent-payments-split-across-parts');
});

test('Rent only: only Rent and Transaction Fee lines', async ({ page }) => {
	const { status, url } = await createSession(page, RENT_LEASE, 100, 'card');
	expect(status).toBe(200);
	const text = await openCheckout(page, url!);
	line(text, 'Rent', '$100.00');
	line(text, 'Transaction Fee', '$3.20');
	expect(text).not.toMatch(/Security Deposit|Late Fee/);
	await shot(page, 'rent-payments-rent-only');
});

test('Not the tenant lease: missing or unknown lease answers 403', async ({ page }) => {
	for (const leaseId of [undefined, '', 'qa-does-not-exist', 'migrated-doesnotexist']) {
		const r = await createSession(page, leaseId as string, 10, 'card');
		expect(r.status, `lease ${String(leaseId)}`).toBe(403);
		expect(r.url).toBeUndefined();
	}
	await openPayment(page);
	await shot(page, 'rent-payments-not-the-tenant-lease');
});

test('Invalid amount: missing or not a number answers 400', async ({ page }) => {
	for (const amount of [undefined, null, 'abc', '', {}]) {
		const r = await createSession(page, DEPOSIT_LEASE, amount, 'card');
		expect(r.status, `amount ${JSON.stringify(amount)}`).toBe(400);
	}
	await openPayment(page);
	await shot(page, 'rent-payments-invalid-amount');
});

test('Amount above the balance answers 400', async ({ page }) => {
	const over = await createSession(page, DEPOSIT_LEASE, 1130.01, 'bank');
	expect(over.status).toBe(400);
	const rentOver = await createSession(page, RENT_LEASE, 2000.01, 'card');
	expect(rentOver.status).toBe(400);
	const exact = await createSession(page, RENT_LEASE, 2000, 'card');
	expect(exact.status).toBe(200); // the full balance is allowed
	await openPayment(page);
	await shot(page, 'rent-payments-amount-above-the-balance');
});

test('Fractional cents and zero or negative amounts answer 400', async ({ page }) => {
	for (const amount of [10.001, 0.005, 0, -5, '10.123']) {
		const r = await createSession(page, DEPOSIT_LEASE, amount, 'card');
		expect(r.status, `amount ${amount}`).toBe(400);
	}
	await openPayment(page);
	await shot(page, 'rent-payments-fractional-cents');
});

test('Return pages: cancel goes to /payment', async ({ page }) => {
	const { url } = await createSession(page, DEPOSIT_LEASE, 5, 'bank');
	await openCheckout(page, url!);
	// The success URL cannot be read without completing; the bank success URL is proven in
	// pending-bank-payments. Here: the Checkout back link returns to /payment.
	await page
		.getByRole('link', { name: /Back|Lehman|Sandbox/i })
		.first()
		.click()
		.catch(async () => {
			await page.locator('a[data-testid="business-link"], a:has(svg)').first().click();
		});
	await page.waitForURL(/lehman-realty-dev\.web\.app\/payment/, { timeout: 30_000 });
	expect(new URL(page.url()).pathname).toBe('/payment');
	await shot(page, 'rent-payments-return-pages-cancel');
});

test('Over balance: dialog shows an error and sends no request', async ({ page }) => {
	await openPayment(page);
	let posts = 0;
	page.on('request', (r) => {
		if (r.url().includes('create-checkout-session')) posts++;
	});
	const dlg = await fillDialog(page, DEPOSIT_LEASE, '1130.01', 'card');
	await dlg.getByRole('button', { name: 'Continue to payment' }).click();
	await expect(dlg.getByRole('alert')).toContainText('no more than $1,130.00');
	expect(posts).toBe(0);
	await expect(page).toHaveURL(/\/payment$/);
	await shot(page, 'rent-payments-over-balance', dlg);
	for (const bad of ['0', '-1', '10.005']) {
		await dlg.getByLabel('Amount').fill(bad);
		await dlg.getByRole('button', { name: 'Continue to payment' }).click();
		await expect(dlg.getByRole('alert')).toBeVisible();
	}
	expect(posts).toBe(0);
});

test('Method choice with fees: card and bank fees for the amount, continues with the chosen method', async ({
	page
}) => {
	await openPayment(page);
	const dlg = await fillDialog(page, DEPOSIT_LEASE, '964.52');
	await expect(dlg.getByText('Card', { exact: true })).toBeVisible();
	await expect(dlg.getByText('Bank account', { exact: true })).toBeVisible();
	await expect(dlg).toContainText('Fee 3% ($28.94)');
	await expect(dlg).toContainText('Fee $5.00');
	await expect(dlg.locator('[data-payment-total]')).toContainText('$993.46');
	await dlg.locator('input[value="bank"]').check();
	await expect(dlg.locator('[data-payment-total]')).toContainText('$969.52');
	await shot(page, 'rent-payments-method-choice-with-fees', dlg);
	// A method is always chosen (card by default), so "require a method" cannot be tested by omission.
	await dlg.getByRole('button', { name: 'Continue to payment' }).click();
	await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
	await expect(page.getByText('Transaction Fee').first()).toBeVisible({ timeout: 45_000 });
	await page.waitForTimeout(2500);
	const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
	line(text, 'Transaction Fee', '$5.00');
	expect(text).toMatch(/US bank account/);
	await shot(page, 'rent-payments-method-choice-continues-bank');
});

test('Return from a completed card Checkout: received message and link back', async ({ page }) => {
	// A real $1.00 test-mode card payment against the QA tenant's ended QA lease.
	await openPayment(page);
	const dlg = await fillDialog(page, CARD_LEASE, '1.00', 'card');
	await dlg.getByRole('button', { name: 'Continue to payment' }).click();
	await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
	await expect(page.getByText('Transaction Fee').first()).toBeVisible({ timeout: 45_000 });
	await page.waitForTimeout(3000);
	if (await page.getByPlaceholder(/1234 1234/).count()) {
		await page.getByPlaceholder(/1234 1234/).fill('4242 4242 4242 4242');
		await page.getByPlaceholder('MM / YY').fill('12 / 34');
		await page.getByPlaceholder('CVC').fill('123');
		const name = page.getByPlaceholder(/full name on card/i);
		if (await name.count()) await name.fill('QA Tenant');
	}
	await pressPay(page);
	await page.waitForLoadState('networkidle');
	expect(new URL(page.url()).pathname).toBe('/payment/success');
	expect(new URL(page.url()).searchParams.has('bank')).toBe(false);
	await expect(page.getByText('Your payment was received by Stripe')).toBeVisible();
	await expect(page.getByText(/business days/)).toHaveCount(0);
	await shot(page, 'rent-payments-return-from-card-checkout');
	await page.getByRole('link', { name: 'Back to payments' }).click();
	await expect(page).toHaveURL(/\/payment$/);
	await expect(leaseCard(page, CARD_LEASE)).toBeVisible();
});
