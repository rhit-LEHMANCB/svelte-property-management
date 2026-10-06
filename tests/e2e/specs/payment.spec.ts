import { expect, test } from '@playwright/test';
import { ADMIN, FAKE_STRIPE_URL, PROPERTY, TENANT } from '../support/constants';
import { signIn } from '../support/helpers';

type Recorded = { path: string; body: Record<string, string> };
const recorded = async () =>
	(await (await fetch(`${FAKE_STRIPE_URL}/__requests`)).json()) as Recorded[];

test.describe('rent-payments', () => {
	test.beforeEach(async () => {
		await fetch(`${FAKE_STRIPE_URL}/__requests`, { method: 'DELETE' });
	});

	test('Scenario: Valid amount sends the tenant to checkout with a Rent line and a transaction fee line', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Make a Payment' }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('spinbutton').fill('500');
		await dialog.getByRole('button', { name: 'Submit' }).click();

		// The browser is sent to the (fake) hosted checkout page.
		await expect(page.locator('#fake-checkout')).toBeVisible();
		await expect(page).toHaveURL(/\/pay\/cs_fake_1$/);

		// What the app asked Stripe for.
		const requests = await recorded();
		expect(requests).toHaveLength(1);
		const body = requests[0].body;
		expect(body['customer']).toBe(TENANT.stripeID);
		expect(body['mode']).toBe('payment');
		expect(body['line_items[0][price_data][product_data][name]']).toBe('Rent');
		expect(body['line_items[0][price_data][unit_amount]']).toBe('50000');
		expect(body['line_items[1][price_data][product_data][name]']).toBe('Transaction Fee');
		// $500 * 2.9% + $0.30 = $14.80
		expect(body['line_items[1][price_data][unit_amount]']).toBe('1480');
		expect(body['invoice_creation[invoice_data][metadata][propertyID]']).toBe(PROPERTY.id);
	});

	test('Scenario: an amount above the balance is refused in the browser and nothing is sent to Stripe', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Make a Payment' }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('spinbutton').fill('999999');
		await dialog.getByRole('button', { name: 'Submit' }).click();

		// Wait for the app to react (an error toast) before checking that nothing was sent.
		await expect(page.getByText(/less than or equal to/)).toBeVisible();
		await expect(page).toHaveURL(/\/payment$/);
		expect(await recorded()).toHaveLength(0);
	});

	test('Scenario: the page shows the real balance and the due date', async ({ page }) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		await expect(page.getByText(/You have a balance of \$1,000\.00 due on/)).toBeVisible();
	});

	test('Scenario: the server refuses an amount above the balance and creates no session', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		const status = await page.evaluate(async () => {
			const response = await fetch('/api/stripe/create-checkout-session/payment', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ amount: 1000.01 })
			});
			return response.status;
		});

		expect(status).toBe(400);
		expect(await recorded()).toHaveLength(0);
	});

	test('Scenario: the confirmation page opens for a tenant', async ({ page }) => {
		await signIn(page, TENANT);
		await page.goto('/payment/success');

		await expect(page.getByText('Thank you for your payment')).toBeVisible();
		await page.getByRole('link', { name: 'Back to payments' }).click();
		await expect(page).toHaveURL(/\/payment$/);
	});

	test('Scenario: an admin opening a tenant page is sent to /admin', async ({ page }) => {
		await signIn(page, ADMIN);

		for (const path of ['/payment', '/maintenance', '/insurance', '/payment/success']) {
			await page.goto(path);
			await expect(page).toHaveURL(/\/admin$/);
		}
	});
});
