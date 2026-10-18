import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { QA_PROPERTY_TITLE, go, signInAs } from './support';
import { STATE } from './state';

// Creates the qa- property and a first lease the other specs use. Removed by zz-cleanup.
test('setup: qa- property and lease', async ({ page }) => {
	await signInAs(page, 'admin');
	await go(page, '/admin/properties');
	const existing = page.locator('a[href*="/edit"]', { hasText: QA_PROPERTY_TITLE });
	let propertyId: string;
	if (await existing.count()) {
		propertyId = (await existing.first().getAttribute('href'))!.match(
			/properties\/([^/]+)\/edit/
		)![1];
	} else {
		await go(page, '/admin/properties/add');
		await page.getByLabel('Title').fill(QA_PROPERTY_TITLE);
		await page.getByLabel('Rent', { exact: true }).fill('1000');
		await page.getByLabel('Description').fill('qa- temporary property for UI QA');
		await page.getByLabel('Bedrooms').fill('2');
		await page.getByLabel('Bathrooms').fill('1');
		await page.getByLabel('Square Feet').fill('900');
		await page.getByLabel('Street Address').fill('1 QA Way');
		await page.getByLabel('City').fill('Testville');
		await page.getByLabel('State').fill('IN');
		await page.getByLabel('Zip Code').fill('47006');
		await page.getByRole('button', { name: 'Save' }).click();
		await page.waitForLoadState('networkidle');
		await expect(page).toHaveURL(/\/admin\/properties\/[^/]+\/edit/, { timeout: 20_000 });
		propertyId = page.url().match(/properties\/([^/]+)\/edit/)![1];
	}

	writeFileSync(STATE, JSON.stringify({ propertyId }));
});
