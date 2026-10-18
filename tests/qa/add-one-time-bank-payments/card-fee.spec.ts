import { expect, test } from '@playwright/test';
import {
	DEPOSIT_LEASE,
	createSession,
	fillDialog,
	openCheckout,
	openPayment,
	shot,
	signInAs
} from './support';

test.setTimeout(150_000);
test.describe.configure({ mode: 'default' });
test.beforeEach(async ({ page }) => {
	await signInAs(page, 'tenant');
});

// amount, expected 3% fee (rounded to the cent), expected total
const cases: [number, string, string][] = [
	[333.33, '$10.00', '$343.33'], // 9.9999 rounds up
	[964.52, '$28.94', '$993.46'], // 28.9356
	[600, '$18.00', '$618.00'],
	[20, '$0.60', '$20.60'],
	[1.5, '$0.05', '$1.55'], // 0.045 rounds half up (spec: rounded to the cent)
	[0.5, '$0.02', '$0.52'] // 0.015
];

for (const [amount, fee, total] of cases) {
	test(`Checkout card fee for $${amount} is ${fee}`, async ({ page }) => {
		const { status, url } = await createSession(page, DEPOSIT_LEASE, amount, 'card');
		expect(status).toBe(200);
		const text = await openCheckout(page, url!);
		expect(text).toMatch(new RegExp(`Transaction Fee[^$]*\\${fee.replace('.', '\\.')}`));
		console.log('FEE_LINE', amount, text.match(/Transaction Fee[^A-Za-z]*/)?.[0]);
		expect(text).toContain(total);
		await shot(page, `rent-payments-card-fee-${String(amount).replace('.', '_')}`);
	});
}

test('Dialog shows Fee 3% and total for several amounts; bank fee stays $5.00', async ({
	page
}) => {
	await openPayment(page);
	for (const [amount, fee, total] of cases.slice(0, 4)) {
		const dlg = await fillDialog(page, DEPOSIT_LEASE, String(amount), 'card');
		await expect(dlg).toContainText(`Fee 3% (${fee})`);
		await expect(dlg.locator('[data-payment-total]')).toContainText(total);
		await dlg.locator('input[value="bank"]').check();
		await expect(dlg).toContainText('Fee $5.00');
		const t = (amount + 5).toFixed(2);
		await expect(dlg.locator('[data-payment-total]')).toContainText(
			`$${Number(t).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
		);
		if (amount === 333.33) await shot(page, 'rent-payments-dialog-fee-333_33', dlg);
		await dlg
			.getByRole('button', { name: /Cancel|Close/ })
			.first()
			.click()
			.catch(() => page.keyboard.press('Escape'));
		await expect(dlg).toBeHidden();
	}
});

test('/payment autopay copy mentions 3% for cards and no old fee', async ({ page }) => {
	await openPayment(page);
	const body = await page.locator('body').innerText();
	expect(body).not.toMatch(/2\.9|\$0\.30/);
	const cards = page.locator('[data-lease]');
	const n = await cards.count();
	let found = 0;
	for (let i = 0; i < n; i++) {
		const c = cards.nth(i);
		if (/transaction fee of 3%/.test(await c.innerText())) {
			found++;
			if (found === 1) await shot(page, 'rent-payments-autopay-copy-3-percent', c);
		}
	}
	console.log('LEASES_WITH_3PCT_COPY', found, 'of', n);
	expect(found).toBeGreaterThan(0);
});
