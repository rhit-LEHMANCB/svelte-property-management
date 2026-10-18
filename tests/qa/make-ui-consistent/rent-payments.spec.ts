import { test } from '@playwright/test';
import { box, expect, go, shot, signInAs } from './support';

test.use({ viewport: { width: 1280, height: 900 } });

test('Over balance: message under the amount field, outline, dialog open, no request sent', async ({
	page
}) => {
	await signInAs(page, 'tenant');
	await go(page, '/payment');
	const requests: string[] = [];
	page.on('request', (r) => {
		if (/stripe|checkout|\/api\//.test(r.url()) && r.method() !== 'GET')
			requests.push(r.method() + ' ' + new URL(r.url()).pathname);
	});
	page.on('framenavigated', (f) => {
		if (f === page.mainFrame()) requests.push('NAV ' + new URL(f.url()).host);
	});
	const buttons = page.getByRole('button', { name: /Make a Payment/ });
	const n = await buttons.count();
	let opened = false;
	for (let i = 0; i < n && !opened; i++) {
		if (await buttons.nth(i).isEnabled()) {
			await buttons.nth(i).click();
			opened = true;
		}
	}
	expect(opened, 'a lease with Make a Payment enabled').toBe(true);
	const dlg = page.locator('[data-payment-dialog]');
	await expect(dlg).toBeVisible();
	await expect(dlg.locator('[data-field-error]')).toHaveCount(0);
	const amount = dlg.getByLabel('Amount');
	await amount.fill('99999.99');
	await dlg.getByRole('button', { name: 'Continue to payment' }).click();
	const msg = dlg.locator('[data-field-error]');
	await expect(msg).toBeVisible();
	const text = (await msg.innerText()).trim();
	const ab = await box(amount);
	const mb = await box(msg);
	console.log(
		'OVER-BALANCE',
		JSON.stringify({
			text,
			gap: Math.round(mb.y - (ab.y + ab.height)),
			cls: await amount.getAttribute('class'),
			invalid: await amount.getAttribute('aria-invalid'),
			requests
		})
	);
	expect(text).toMatch(/must be no more than \$/);
	expect(mb.y).toBeGreaterThanOrEqual(ab.y + ab.height - 1);
	await expect(amount).toHaveAttribute('aria-invalid', 'true');
	expect(await amount.getAttribute('class')).toContain('input-error');
	await expect(dlg).toBeVisible();
	expect(requests).toEqual([]);
	expect(page.url()).toContain('lehman-realty-dev.web.app/payment');
	await shot(page, 'rent-payments-over-balance');
	// The message follows what is typed: a payable amount clears it. (Nothing is submitted.)
	await amount.fill('0.01');
	await expect(msg).toHaveCount(0);
	await shot(page, 'rent-payments-over-balance-cleared');
	await dlg.getByRole('button', { name: 'Cancel' }).click();
	expect(requests).toEqual([]);
});

test('Method choice with fees: Card 3% and Bank account $5.00 shown (no payment started)', async ({
	page
}) => {
	await signInAs(page, 'tenant');
	await go(page, '/payment');
	const buttons = page.getByRole('button', { name: /Make a Payment/ });
	for (let i = 0; i < (await buttons.count()); i++)
		if (await buttons.nth(i).isEnabled()) {
			await buttons.nth(i).click();
			break;
		}
	const dlg = page.locator('[data-payment-dialog]');
	await dlg.getByLabel('Amount').fill('10');
	await expect(dlg).toContainText('Card');
	await expect(dlg).toContainText('Fee 3% ($0.30)');
	await expect(dlg).toContainText('Bank account');
	await expect(dlg).toContainText('Fee $5.00');
	await shot(page, 'rent-payments-method-choice-with-fees');
	await dlg.getByRole('button', { name: 'Cancel' }).click();
});
