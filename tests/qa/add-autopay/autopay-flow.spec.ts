import { expect, test } from '@playwright/test';
import {
	CREDIT_LEASE,
	CREDIT_PROPERTY,
	PAYMENTS_LEASE,
	leaseCard,
	shotEl,
	signInAs
} from './support';

const json = { 'Content-Type': 'application/json' };
test.describe.configure({ mode: 'serial' });

let sessionId = '';

test.afterAll(async ({ browser }) => {
	// Cleanup: make sure the QA tenant is not left enrolled.
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await signInAs(page, 'tenant');
	const r = await page.request.delete('/api/autopay', {
		data: { leaseId: CREDIT_LEASE },
		headers: json
	});
	console.log('CLEANUP delete status', r.status());
	const again = await page.request.delete('/api/autopay', {
		data: { leaseId: CREDIT_LEASE },
		headers: json
	});
	console.log('CLEANUP second delete status (404 means nothing enrolled):', again.status());
	await ctx.close();
});

test('Not enrolled: amount field and Set up autopay button', async ({ page }) => {
	await signInAs(page, 'tenant');
	const card = await leaseCard(page, CREDIT_LEASE);
	await expect(card.getByLabel('Amount (optional)')).toBeVisible();
	await expect(card.getByRole('button', { name: /Set up autopay/ })).toBeVisible();
	await shotEl(page, page.locator(`[data-lease="${CREDIT_LEASE}"]`), 'controls-not-enrolled');
});

test('Start setup and save a card on Stripe, then Enrolled view', async ({ page }) => {
	test.setTimeout(100_000);
	await signInAs(page, 'tenant');
	const card = await leaseCard(page, CREDIT_LEASE);
	await card.getByLabel('Amount (optional)').fill('100.50');
	await card.getByRole('button', { name: /Set up autopay/ }).click();
	await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 }).catch(() => undefined);
	if (!/checkout\.stripe\.com/.test(page.url()))
		test.info().annotations.push({ type: 'environment', description: 'never reached Stripe' });
	expect(page.url()).toMatch(/checkout\.stripe\.com/);
	await page.waitForLoadState('networkidle').catch(() => undefined);
	await page.locator('#payment-method-label-card').click({ force: true });
	await page.getByPlaceholder(/1234 1234/).waitFor({ timeout: 20_000 });
	await page.getByPlaceholder(/1234 1234/).fill('4242 4242 4242 4242');
	await page.getByPlaceholder('MM / YY').fill('12 / 34');
	await page.getByPlaceholder('CVC').fill('123');
	const name = page.getByPlaceholder(/full name on card/i);
	if (await name.count()) await name.fill('QA Tenant');
	const zip = page.getByPlaceholder(/zip/i);
	if (await zip.count()) await zip.first().fill('46204');
	const link = page.getByLabel(/Save my information with/i);
	if (await link.count()) await link.uncheck();
	// Mask the Stripe email field (it shows the QA account address) in the evidence.
	await page.screenshot({
		path: 'openspec/changes/add-autopay/qa/screenshots/autopay-start-setup-stripe-page.png',
		fullPage: true,
		mask: [page.locator('input[type=email], #email, [name=email]'), page.getByText(/@/)]
	});
	await page.getByTestId('hosted-payment-submit-button').click();
	await page.waitForURL(/lehman-realty-dev\.web\.app\/payment/, { timeout: 90_000 });
	sessionId = new URL(page.url()).searchParams.get('autopay_session') ?? '';
	console.log('returned with session param:', Boolean(sessionId));
	await expect(
		page.locator(`[data-lease="${CREDIT_LEASE}"]`).getByText('Visa ending 4242')
	).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(`[data-lease="${CREDIT_LEASE}"] [data-autopay]`)).toContainText(
		'$100.50'
	);
	await shotEl(page, page.locator(`[data-lease="${CREDIT_LEASE}"]`), 'controls-enrolled');
});

test('Payment method details stay server-side on /payment', async ({ page }) => {
	await signInAs(page, 'tenant');
	await leaseCard(page, CREDIT_LEASE);
	const data = await page.request.get('/payment/__data.json');
	const html = await (await page.request.get('/payment')).text();
	const dataText = await data.text();
	expect(dataText).not.toMatch(/pm_[A-Za-z0-9]{6,}/);
	expect(html).not.toMatch(/pm_[A-Za-z0-9]{6,}/);
	expect(dataText).toMatch(/4242/);
	await shotEl(page, page.locator(`[data-lease="${CREDIT_LEASE}"]`), 'no-payment-method-id');
});

test('Completing twice leaves the enrollment unchanged', async ({ page }) => {
	test.skip(!sessionId, 'no session id captured');
	await signInAs(page, 'tenant');
	const a = await page.request.post('/api/autopay/complete', {
		data: { sessionId },
		headers: json
	});
	const bodyA = await a.text();
	console.log('second complete', a.status());
	expect(JSON.stringify(bodyA)).not.toMatch(/pm_[A-Za-z0-9]{6,}/);
	expect(a.status()).toBeLessThan(300);
	const card = await leaseCard(page, CREDIT_LEASE);
	await expect(card).toContainText('Visa ending 4242');
	await expect(card).toContainText('$100.50');
	await shotEl(page, card, 'complete-twice');
});

test('Change amount, then back to full balance', async ({ page }) => {
	await signInAs(page, 'tenant');
	const card = await leaseCard(page, CREDIT_LEASE);
	await card.getByRole('button', { name: 'Change amount' }).click();
	const dlg = page.getByRole('dialog');
	await dlg.locator('input').fill('250.25');
	await dlg.getByRole('button', { name: /submit|ok|save/i }).click();
	await expect(card).toContainText('$250.25');
	await shotEl(page, page.locator(`[data-lease="${CREDIT_LEASE}"]`), 'change-amount');
	await card.getByRole('button', { name: 'Change amount' }).click();
	await dlg.locator('input').fill('');
	await dlg.getByRole('button', { name: /submit|ok|save/i }).click();
	await expect(card).toContainText('Full balance');
	await shotEl(page, page.locator(`[data-lease="${CREDIT_LEASE}"]`), 'change-amount-full-balance');
	const bad = await page.request.patch('/api/autopay', {
		data: { leaseId: CREDIT_LEASE, amount: -1 },
		headers: json
	});
	expect(bad.status()).toBe(400);
});

test('Admin lease list shows autopay read-only', async ({ page }) => {
	await signInAs(page, 'admin');
	await page.goto(`/admin/properties/${CREDIT_PROPERTY}/edit?tab=leases`);
	await page.waitForLoadState('networkidle');
	const tab = page.getByRole('tab', { name: /leases/i });
	if (await tab.count()) await tab.first().click();
	const list = page.getByRole('list', { name: 'Autopay' });
	await expect(list).toContainText('Visa ending 4242');
	await expect(list).toContainText(/full balance/i);
	await expect(
		page.getByRole('button', { name: /turn off|change amount|set up autopay/i })
	).toHaveCount(0);
	const dataText = await (
		await page.request.get(`/admin/properties/${CREDIT_PROPERTY}/edit/__data.json`)
	).text();
	expect(dataText).not.toMatch(/pm_[A-Za-z0-9]{6,}/);
	await shotEl(page, page.getByRole('list', { name: 'Leases' }), 'admin-lease-list');
});

test('Admin cannot change or end tenant autopay (read-only)', async ({ page }) => {
	await signInAs(page, 'admin');
	const p = await page.request.patch('/api/autopay', {
		data: { leaseId: CREDIT_LEASE, amount: 1 },
		headers: json
	});
	const d = await page.request.delete('/api/autopay', {
		data: { leaseId: CREDIT_LEASE },
		headers: json
	});
	expect([403, 404]).toContain(p.status());
	expect([403, 404]).toContain(d.status());
	await page.goto('/admin');
	await shotEl(page, page.locator('main, body').first(), 'admin-cannot-end-autopay');
});

test('Turn off removes the enrollment', async ({ page }) => {
	await signInAs(page, 'tenant');
	const card = await leaseCard(page, CREDIT_LEASE);
	await card.getByRole('button', { name: 'Turn off autopay' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Turn off' }).click();
	await expect(card.getByRole('button', { name: /Set up autopay/ })).toBeVisible();
	await shotEl(page, page.locator(`[data-lease="${CREDIT_LEASE}"]`), 'turn-off');
});

test('Checkout copy: one-time payment fee line no longer mentions auto-pay', async ({ page }) => {
	test.setTimeout(120_000);
	await signInAs(page, 'tenant');
	const r = await page.request.post('/api/stripe/create-checkout-session/payment', {
		data: { amount: 10, leaseId: PAYMENTS_LEASE },
		headers: json
	});
	expect(r.status()).toBe(200);
	const { url } = await r.json();
	await page.goto(url);
	await page.waitForLoadState('networkidle').catch(() => undefined);
	const body = await page.locator('body').innerText();
	console.log(
		'checkout mentions Transaction Fee:',
		/Transaction Fee/i.test(body),
		' mentions auto-pay:',
		/auto-?pay/i.test(body)
	);
	await page.screenshot({
		path: 'openspec/changes/add-autopay/qa/screenshots/autopay-checkout-fee-line.png',
		fullPage: true,
		mask: [page.locator('input[type=email], [name=email]'), page.getByText(/@/)]
	});
	expect(body).toMatch(/Transaction Fee/i);
	expect(body).not.toMatch(/auto-?pay/i);
});
