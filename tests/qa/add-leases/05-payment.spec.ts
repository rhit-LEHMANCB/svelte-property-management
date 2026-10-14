import { test, expect } from '@playwright/test';
import { ready, shot, loadState, saveState, newSession, SCRATCH, SHOTS } from './helpers';

test.setTimeout(150_000);

test('rent-payments: Valid amount - Stripe test-mode checkout, then balance after the webhook', async ({
	browser
}) => {
	const { leaseA1 } = loadState();
	const { ctx, page } = await newSession(browser, 'tenant');
	page.setDefaultTimeout(20000);
	await page.goto('/payment');
	await ready(page);
	await page.getByRole('button', { name: /Make a Payment for 101 QA Alpha St/ }).click();
	await page.getByRole('dialog').locator('input').fill('100');
	await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
	await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60000 });
	await page.waitForLoadState('networkidle').catch(() => {});
	await expect(page.getByText('Transaction Fee').first()).toBeVisible();
	await expect(page.getByText('$3.20').first()).toBeVisible();
	await page.screenshot({
		path: `${SHOTS}/rent-payments-valid-amount-checkout-lines.png`,
		clip: { x: 0, y: 0, width: 630, height: 420 }
	});
	// card details (Stripe test card)
	await page.waitForTimeout(3000);
	await page
		.getByText('Card', { exact: true })
		.locator('visible=true')
		.first()
		.click({ force: true });
	await page.locator('#cardNumber').fill('4242424242424242');
	await page.locator('#cardExpiry').fill('1234');
	await page.locator('#cardCvc').fill('123');
	await page
		.locator('#enableStripePass')
		.uncheck()
		.catch(() => {});
	const nm = page.locator('#billingName');
	if (await nm.count()) await nm.fill('QA Tester');
	const zp = page.locator('#billingPostalCode');
	if (await zp.count()) await zp.fill('47803');
	await page.getByTestId('hosted-payment-submit-button').click();
	await page.waitForURL(/payment\/success/, { timeout: 120000 });
	await ready(page);
	await shot(page, 'rent-payments-valid-amount-success-page');
	saveState({ paid100: true });
	// webhook delivery is asynchronous
	await expect(async () => {
		await page.goto('/payment');
		await ready(page);
		await expect(page.getByText('$3,500.00')).toBeVisible({ timeout: 3000 });
	}).toPass({ timeout: 90000, intervals: [3000] });
	await shot(page, 'rent-payments-partial-payment-balance-reduced');
	console.log(
		'PAYMENT TEXT:',
		(
			await page
				.locator('main')
				.innerText()
				.catch(() => '')
		)
			.replace(/\n+/g, ' | ')
			.slice(0, 500)
	);
	await ctx.close();
});
