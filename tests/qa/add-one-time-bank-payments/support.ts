import { expect, type Locator, type Page } from '@playwright/test';
export { signInAs } from '../add-autopay/support';

export const SHOTS = 'openspec/changes/add-one-time-bank-payments/qa/screenshots';
export const json = { 'Content-Type': 'application/json' };

// Existing ended QA leases of the QA tenant (not created by this run; only paid by test payments).
export const DEPOSIT_LEASE = 'IopO2Aqo5Glp3aY5CVqX'; // $500 deposit + $1,000 rent, never paid by this run
export const RENT_LEASE = 'cMbStS2LIUsbkinqemgt'; // $800 rent, API validation only (no payment completed)
export const BANK_LEASE = 'x38pJw0O3L9cWdWiKphW'; // $800 rent, bank payments are completed here
export const CARD_LEASE = 'k28Qa0V7H8Vl9QJLyqm0'; // $500 deposit + $1,000 rent, one $1 card payment here

export async function shot(page: Page, slug: string, target?: Locator) {
	const path = `${SHOTS}/${slug}.png`;
	// The QA tenant's email shows on Stripe's pages and in the app; mask it.
	const mask = [page.getByText(/@/), page.locator('input[type="email"], input[name="email"]')];
	if (target) {
		await target.scrollIntoViewIfNeeded();
		await target.screenshot({ path, mask });
	} else {
		await page.screenshot({ path, fullPage: true, mask });
	}
}

export async function openPayment(page: Page) {
	await page.goto('/payment');
	await page.waitForLoadState('networkidle');
}

export const leaseCard = (page: Page, id: string) => page.locator(`[data-lease="${id}"]`);

/** Open the dialog on a lease, type an amount and choose a method (does not submit). */
export async function fillDialog(page: Page, leaseId: string, amount: string, method?: 'card' | 'bank') {
	await leaseCard(page, leaseId).getByRole('button', { name: /Make a Payment/ }).click();
	const dlg = page.locator('[data-payment-dialog]');
	await expect(dlg).toBeVisible();
	await dlg.getByLabel('Amount').fill(amount);
	if (method === 'bank') await dlg.locator('input[value="bank"]').check();
	if (method === 'card') await dlg.locator('input[value="card"]').check();
	return dlg;
}

async function clickInFrames(page: Page, name: string | RegExp, role: 'button' | 'text' = 'button') {
	for (const f of page.frames()) {
		const el = role === 'button' ? f.getByRole('button', { name }) : f.getByText(name);
		if (await el.count().catch(() => 0)) {
			await el.first().click();
			return true;
		}
	}
	return false;
}

/** On Stripe's hosted bank Checkout: connect a test institution account and pay. */
export async function payWithTestBank(page: Page, account: RegExp = /Success\s*••••6789/) {
	await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
	await page.getByLabel('Full name').fill('QA Tenant');
	await page.getByText('Test (Non-OAuth)').first().click();
	await expect.poll(() => clickInFrames(page, 'Agree and continue'), { timeout: 40_000 }).toBe(true);
	// Choose the account, then connect it.
	await expect
		.poll(
			async () => {
				for (const f of page.frames()) {
					const row = f.getByText(account);
					if (await row.count().catch(() => 0)) {
						await row.first().click();
						return true;
					}
				}
				return false;
			},
			{ timeout: 40_000 }
		)
		.toBe(true);
	await expect.poll(() => clickInFrames(page, /Connect account/i), { timeout: 30_000 }).toBe(true);
	// Link may offer to save the account; decline if asked, then wait for the Pay button.
	await expect.poll(() => clickInFrames(page, /Finish without saving/i), { timeout: 40_000 }).toBe(true);
	await expect.poll(() => clickInFrames(page, /Continue to/i), { timeout: 40_000 }).toBe(true);
	await page.waitForTimeout(3000);
}

/** Press Pay on Stripe's Checkout and wait for the redirect back to the app. */
export async function pressPay(page: Page) {
	await page.getByTestId('hosted-payment-submit-button').click({ timeout: 30_000 });
	await page.waitForURL(/lehman-realty-dev\.web\.app/, { timeout: 90_000 });
}

/** Create a Checkout session through the app's API and open Stripe's page for it. */
export async function createSession(page: Page, leaseId: string, amount: unknown, method: unknown) {
	const r = await page.request.post('/api/stripe/create-checkout-session/payment', {
		data: { leaseId, amount, method },
		headers: json
	});
	const body = await r.json().catch(() => ({}));
	return { status: r.status(), url: body.url as string | undefined };
}

/** Text of Stripe's hosted Checkout page for a session URL, once the line items have rendered. */
export async function openCheckout(page: Page, url: string) {
	await page.goto(url);
	await expect(page.getByText('Transaction Fee').first()).toBeVisible({ timeout: 45_000 });
	await page.waitForTimeout(2500);
	return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
}
