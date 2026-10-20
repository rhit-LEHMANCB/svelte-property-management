import { expect, test } from '@playwright/test';
import { deleteViaMenu, loadSeed, searchList, shot, signInAs } from './support';

const REFUSAL = /leases with recorded payments/;

test.setTimeout(90_000);
test.beforeEach(async ({ page }) => signInAs(page, 'admin'));

async function leasesTab(page: import('@playwright/test').Page, propertyId: string) {
	await page.goto(`/admin/properties/${propertyId}/edit?tab=leases`);
	await page.waitForLoadState('networkidle');
}

test('A lease has rent payments: 409, nothing removed', async ({ page }) => {
	const s = loadSeed().rent;
	const r = await page.request.delete(`/api/property/${s.propertyId}`);
	expect(r.status()).toBe(409);
	const body = await r.json();
	console.log('rent property message:', body.message);
	expect(body.message).toMatch(REFUSAL);
	expect(body.message).toMatch(/end date/i);
	await leasesTab(page, s.propertyId);
	await expect(page.locator(`a[href$="/leases/${s.leaseId}"]`)).toHaveCount(1);
	await searchList(page, s.title);
	await expect(page.getByRole('link', { name: s.title })).toBeVisible();
	await leasesTab(page, s.propertyId);
	await shot(page, 'property-management-a-lease-has-rent-payments');
});

test('A lease has only a deposit payment: 409 and nothing removed', async ({ page }) => {
	const s = loadSeed().deposit;
	const r = await page.request.delete(`/api/property/${s.propertyId}`);
	expect(r.status()).toBe(409);
	await leasesTab(page, s.propertyId);
	await expect(page.locator(`a[href$="/leases/${s.leaseId}"]`)).toHaveCount(1);
	await shot(page, 'property-management-a-lease-has-only-a-deposit-payment');
});

test('Refused delete from the list: toast shows the reason, property stays', async ({ page }) => {
	const s = loadSeed().rent;
	await deleteViaMenu(page, s.title);
	const toast = page.getByText(REFUSAL).first();
	await expect(toast).toBeVisible();
	await expect(page.getByText('Error removing property.')).toHaveCount(0);
	await expect(page.getByRole('link', { name: s.title })).toBeVisible();
	await shot(page, 'property-management-refused-delete-toast');
});

for (const [name, status, body] of [
	['500 with a message', 500, { message: 'internal detail' }],
	['500 without a body', 500, undefined],
	['403 with a message', 403, { message: 'Not allowed here' }]
] as const) {
	test(`Other failure (${name}): generic toast`, async ({ page }) => {
		const s = loadSeed().rent;
		await page.route(`**/api/property/${s.propertyId}`, (route) =>
			route.request().method() === 'DELETE'
				? route.fulfill(
						body
							? { status, contentType: 'application/json', body: JSON.stringify(body) }
							: { status, body: '' }
					)
				: route.continue()
		);
		await deleteViaMenu(page, s.title);
		await expect(page.getByText('Error removing property.')).toBeVisible();
		await expect(page.getByText('internal detail')).toHaveCount(0);
		await expect(page.getByText('Not allowed here')).toHaveCount(0);
		await shot(page, `property-management-other-failure-${status}${body ? '-message' : '-no-body'}`);
	});
}

test('Leases without payments: property deleted, other properties untouched', async ({ page }) => {
	const seed = loadSeed();
	const s = seed.none;
	await searchList(page, s.title);
	await expect(page.getByRole('link', { name: s.title })).toBeVisible();
	await deleteViaMenu(page, s.title);
	await expect(page.getByText('Property Successfully Removed.')).toBeVisible();
	await page.waitForLoadState('networkidle');
	await searchList(page, s.title);
	await expect(page.getByRole('link', { name: s.title })).toHaveCount(0);
	await searchList(page, 'qa-protect-');
	for (const k of ['rent', 'deposit', 'other'])
		await expect(page.getByRole('link', { name: seed[k].title })).toBeVisible();
	await shot(page, 'property-management-leases-without-payments-deleted');
	// The deleted property's lease is gone.
	const gone = await page.request.get(`/admin/properties/${s.propertyId}/leases/${s.leaseId}`);
	console.log('deleted property lease page status', gone.status());
	expect(gone.status()).toBeGreaterThanOrEqual(400);
	// The paid leases and their histories are intact.
	for (const k of ['rent', 'deposit']) {
		await page.goto(`/admin/properties/${seed[k].propertyId}/leases/${seed[k].leaseId}`);
		await expect(page.getByRole('button', { name: 'Delete lease' })).toBeDisabled();
	}
	await shot(page, 'property-management-other-properties-untouched');
});

test('Property with a lease with no payments and one lease deleted API path: 2xx', async ({ page }) => {
	const s = loadSeed().none2;
	const r = await page.request.delete(`/api/property/${s.propertyId}`);
	expect(r.status()).toBeLessThan(300);
});
