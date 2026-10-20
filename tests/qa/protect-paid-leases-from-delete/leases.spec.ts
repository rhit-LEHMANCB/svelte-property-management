import { expect, test } from '@playwright/test';
import { createLease, createProperty, loadSeed, shot, signInAs } from './support';

const deleteCard = (page: import('@playwright/test').Page) =>
	page.getByRole('button', { name: 'Delete lease' }).locator('xpath=ancestor::*[contains(@class,"card")][1]');
const NOTE = /cannot be deleted/;

async function openLease(page: import('@playwright/test').Page, key: string) {
	const s = loadSeed()[key];
	await page.goto(`/admin/properties/${s.propertyId}/leases/${s.leaseId}`);
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('button', { name: 'Delete lease' })).toBeVisible();
	return s;
}

test.beforeEach(async ({ page }) => signInAs(page, 'admin'));

test('Edit page for a lease with payments (rent)', async ({ page }) => {
	await openLease(page, 'rent');
	await expect(page.getByText(/recorded payments, so it cannot be deleted/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Delete lease' })).toBeDisabled();
	await page.getByRole('button', { name: 'Delete lease' }).scrollIntoViewIfNeeded();
	await shot(page, 'leases-edit-page-for-a-lease-with-payments-rent', deleteCard(page));
});

test('Edit page for a lease with only a deposit payment', async ({ page }) => {
	await openLease(page, 'deposit');
	await expect(page.getByText(/recorded payments, so it cannot be deleted/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Delete lease' })).toBeDisabled();
	await shot(page, 'leases-edit-page-for-a-lease-with-only-a-deposit-payment', deleteCard(page));
});

test('Has payments / only deposit: API delete answers 409 and nothing is removed', async ({ page }) => {
	const seed = loadSeed();
	for (const key of ['rent', 'deposit']) {
		const r = await page.request.delete(`/api/lease/${seed[key].leaseId}`);
		expect(r.status(), key).toBe(409);
		const body = await r.json();
		console.log(key, 'lease delete message:', body.message);
		expect(body.message).toMatch(/end date/i);
		await page.goto(`/admin/properties/${seed[key].propertyId}/leases/${seed[key].leaseId}`);
		await expect(page.getByRole('button', { name: 'Delete lease' })).toBeVisible();
	}
	await page.goto(`/admin/properties/${seed.deposit.propertyId}/edit?tab=leases`);
	await page.waitForLoadState('networkidle');
	await shot(page, 'leases-has-only-a-deposit-payment');
});

test('No payments: edit page has no note and Delete enabled, then deleting removes the lease', async ({ page }) => {
	const propertyId = await createProperty(page, `qa-protect-leasedel-${Date.now().toString(36)}`);
	const leaseId = await createLease(page, propertyId, { start: '2020-06-01', end: '2020-06-30', lateFee: '10' });
	await page.goto(`/admin/properties/${propertyId}/leases/${leaseId}`);
	await page.waitForLoadState('networkidle');
	await expect(page.getByText(NOTE)).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Delete lease' })).toBeEnabled();
	await shot(page, 'leases-edit-page-for-a-lease-with-no-payments', deleteCard(page));
	await page.getByRole('button', { name: 'Delete lease' }).click();
	await page.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByText('Lease deleted.')).toBeVisible();
	await expect(page).toHaveURL(/tab=leases/);
	await page.waitForLoadState('networkidle');
	await expect(page.locator(`a[href$="/leases/${leaseId}"]`)).toHaveCount(0);
	await shot(page, 'leases-no-payments-lease-deleted');
	const again = await page.request.get(`/admin/properties/${propertyId}/leases/${leaseId}`);
	console.log('deleted lease page status', again.status());
});
