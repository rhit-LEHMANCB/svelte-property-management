import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { fillLease, ready, saveLease, loadState, shot, newSession, payA } from './helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(170_000);

let tctx: BrowserContext, actx: BrowserContext;
let tpage: Page, apage: Page;
test.beforeAll(async ({ browser }) => {
	({ ctx: tctx, page: tpage } = await newSession(browser, 'tenant'));
	({ ctx: actx, page: apage } = await newSession(browser, 'admin'));
});
test.afterAll(async () => {
	await tctx.close();
	await actx.close();
});

const balanceOfA = async () => {
	await tpage.goto('/payment');
	await ready(tpage);
	const block = tpage.locator('[data-lease]').filter({ hasText: '101 QA Alpha St' });
	return (await block.innerText()).replace(/\n+/g, ' | ');
};

test('leases: Delete a lease that has payments responds 409 and removes nothing', async () => {
	const { propA, leaseA1 } = loadState();
	await apage.goto(`/admin/properties/${propA}/leases/${leaseA1}`);
	await ready(apage);
	await expect(apage.getByText('This lease has recorded payments.')).toBeVisible();
	await apage.getByRole('button', { name: 'Delete lease' }).click();
	await apage.getByRole('button', { name: 'Confirm' }).click();
	await apage.waitForTimeout(2500);
	await shot(apage, 'leases-delete-with-payments-refused');
	const api = await apage.request.delete(`/api/lease/${leaseA1}`);
	console.log('DELETE with payments:', api.status(), await api.text());
	expect(api.status()).toBe(409);
	await apage.goto(`/admin/properties/${propA}/leases/${leaseA1}`);
	await ready(apage);
	await expect(apage.getByText('Edit lease').first()).toBeVisible();
	await expect(apage.getByRole('link', { name: 'View document' })).toBeVisible();
});

test('leases: Change the rent keeps recorded months and charges the new rent elsewhere', async () => {
	const { propA, leaseA1 } = loadState();
	console.log('BEFORE RENT CHANGE:', await balanceOfA());
	await apage.goto(`/admin/properties/${propA}/leases/${leaseA1}`);
	await ready(apage);
	await fillLease(apage, { rent: '1000' });
	await saveLease(apage);
	await apage.waitForTimeout(4000);
	console.log('after save url', apage.url());
	const text = await balanceOfA();
	console.log('AFTER RENT CHANGE:', text);
	// June has a payment entry: it keeps $1,100 remaining; July and August are now $1,000 each => $3,100
	await expect(tpage.getByText('$3,100.00')).toBeVisible();
	await shot(tpage, 'leases-change-the-rent');
});

test('rent-payments: Payment covers carried-over months', async () => {
	await payA(tpage, '2200');
	await shot(tpage, 'rent-payments-payment-covers-carried-over-months-success');
	await expect(async () => {
		const t = await balanceOfA();
		expect(t).toContain('$900.00');
	}).toPass({ timeout: 90000, intervals: [3000] });
	await shot(tpage, 'rent-payments-payment-covers-carried-over-months');
});

test('rent-payments: Overpayment is refused by the server', async () => {
	const { leaseA1 } = loadState();
	const r = await tpage.request.post('/api/stripe/create-checkout-session/payment', {
		data: { leaseId: leaseA1, amount: 900.01 }
	});
	console.log('OVERPAY', r.status(), await r.text());
	expect(r.status()).toBe(400);
});

test('rent-payments: Paid in full on the lease', async () => {
	await payA(tpage, '900');
	await expect(async () => {
		await tpage.goto('/payment');
		await ready(tpage);
		await expect(tpage.locator('[data-lease]').filter({ hasText: '101 QA Alpha St' })).toHaveCount(
			0,
			{ timeout: 3000 }
		);
	}).toPass({ timeout: 90000, intervals: [3000] });
	console.log(
		'PAID IN FULL PAGE:',
		(await tpage.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 400)
	);
	await shot(tpage, 'rent-payments-paid-in-full-on-the-lease');
});
