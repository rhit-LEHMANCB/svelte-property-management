import { expect, test } from '@playwright/test';
import { EXISTING_PROPERTY, MISSING_PROPERTY, shot, signInAs } from './support';

test.describe('property-management', () => {
	test('Unknown property (admin)', async ({ page }) => {
		await signInAs(page, 'admin');
		const edit = await page.goto(`/admin/properties/${MISSING_PROPERTY}/edit`);
		await page.waitForLoadState('networkidle');
		const editText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
		await shot(page, 'property-management-unknown-property');
		const lease = await page.goto(`/admin/properties/${MISSING_PROPERTY}/leases/new`);
		const leaseText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
		await shot(page, 'property-management-unknown-property-leases-new-reference');
		console.log('edit', edit!.status(), editText.slice(0, 200));
		console.log('lease', lease!.status(), leaseText.slice(0, 200));
		expect(edit!.status()).toBe(404);
		expect(editText).toContain('Property not found');
		expect(lease!.status()).toBe(404);
		// Same not-found page shape as the existing route.
		expect(editText).toBe(leaseText);
	});

	test('Existing property edit page still loads (admin)', async ({ page }) => {
		await signInAs(page, 'admin');
		const r = await page.goto(`/admin/properties/${EXISTING_PROPERTY}/edit`);
		await page.waitForLoadState('networkidle');
		expect(r!.status()).toBe(200);
		await expect(page.locator('form')).toBeVisible();
		await shot(page, 'property-management-edit-existing-property');
	});

	test('Tenant cannot use admin edit page', async ({ page }) => {
		await signInAs(page, 'tenant');
		for (const id of [EXISTING_PROPERTY, MISSING_PROPERTY]) {
			const r = await page.goto(`/admin/properties/${id}/edit`);
			await page.waitForLoadState('networkidle');
			console.log('tenant', id, r!.status(), page.url());
			expect(r!.status()).not.toBe(200);
			await expect(page.locator('form input[name="name"], form input[name="address"]')).toHaveCount(
				0
			);
		}
		await shot(page, 'property-management-tenant-denied-edit');
	});
});
