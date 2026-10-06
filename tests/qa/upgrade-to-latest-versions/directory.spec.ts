import { expect, test, type Page } from '@playwright/test';
import { shot, signIn, watch } from './helpers';

test.setTimeout(150000);
test.use({ actionTimeout: 15000 });

const PROP = `qa-c3-dir-${Date.now()}`;
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

async function showAll(page: Page) {
	const sel = page.getByLabel('Items per page');
	if (await sel.count()) await sel.selectOption('10').catch(() => {});
}
async function rowFor(page: Page, title: string) {
	// walk pages until the property is found
	for (let i = 0; i < 20; i++) {
		const row = page.locator('ul.list a', { hasText: title });
		if (await row.count()) return row;
		const next = page.getByRole('button', { name: /Next/ });
		if (!(await next.isEnabled().catch(() => false))) break;
		await next.click();
	}
	return page.locator('ul.list a', { hasText: title });
}

test('property-management: delete photo, then directory still loads and lists property; delete via directory dialog', async ({
	page
}) => {
	const w = watch(page, 'directory');
	await page.route('**/maps.googleapis.com/**', (r) => r.abort());
	await signIn(page, 'admin');
	await page.goto('/admin/properties/add');
	await page.waitForLoadState('networkidle');
	await page.getByTitle('Title', { exact: true }).fill(PROP);
	await page.getByTitle('Rent').fill('900');
	await page.getByTitle('Description').fill('qa- automated');
	await page.getByTitle('Bedrooms').fill('1');
	await page.getByTitle('Bathrooms').fill('1');
	await page.getByTitle('Square Feet').fill('400');
	await page.getByTitle('Street Address').fill('2 QA St');
	await page.getByTitle('City').fill('Terre Haute');
	await page.getByTitle('State').fill('IN');
	await page.getByTitle('Zip Code').fill('47803');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Successfully created property')).toBeVisible();
	await expect(page).toHaveURL(/\/admin\/properties\/[^/]+\/edit$/);
	await page.waitForLoadState('networkidle');

	await page.getByText('Photos', { exact: true }).click();
	await page
		.locator('input[type="file"][name="photos"]')
		.setInputFiles([{ name: 'qa.png', mimeType: 'image/png', buffer: PNG }]);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('img[alt]')).toHaveCount(1, { timeout: 20000 });
	await page
		.locator('.group', { has: page.locator('img') })
		.first()
		.hover();
	await page.getByRole('button', { name: 'Delete' }).first().click();
	await expect(page.getByText('Photo successfully deleted.')).toBeVisible();
	await expect(page.locator('img[alt]')).toHaveCount(0);
	await shot(page, 'property-management-photo-deleted');

	const r = await page.goto('/admin/properties');
	await page.waitForLoadState('networkidle');
	console.log('directory status after photo delete', r?.status());
	await showAll(page);
	await shot(page, 'property-management-directory-after-photo-delete');
	expect(r?.status()).toBe(200);
	const names = await page.locator('ul.list a strong').allInnerTexts();
	console.log('directory titles on page', JSON.stringify(names));
	let row = await rowFor(page, PROP);
	await expect(row).toBeVisible();
	await shot(page, 'property-management-directory-lists-property');

	// delete via the directory: cancel first
	await row.getByRole('button').click();
	const dlg = page.getByRole('dialog');
	await expect(dlg).toContainText(`Are you sure you wish to delete ${PROP}`);
	await shot(page, 'app-platform-directory-delete-dialog');
	await dlg.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page).toHaveURL(/\/admin\/properties$/);
	row = await rowFor(page, PROP);
	await expect(row).toBeVisible();
	await shot(page, 'property-management-directory-delete-cancelled');
	// then confirm
	await row.getByRole('button').click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /Confirm/ })
		.click();
	await expect(page.getByText('Property Successfully Removed.')).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await shot(page, 'property-management-directory-delete-confirmed-toast');
	await page.waitForTimeout(1500);
	await page.goto('/admin/properties');
	await page.waitForLoadState('networkidle');
	await showAll(page);
	await expect(page.locator('ul.list a', { hasText: PROP })).toHaveCount(0);
	const rest = await rowFor(page, PROP);
	await expect(rest).toHaveCount(0);
	w.report(test.info());
});

test('property-management: list leftover qa- properties in directory (read only)', async ({
	page
}) => {
	await signIn(page, 'admin');
	await page.goto('/admin/properties');
	await page.waitForLoadState('networkidle');
	await page
		.getByLabel('Items per page')
		.selectOption('10')
		.catch(() => {});
	const all: string[] = [];
	for (let i = 0; i < 20; i++) {
		all.push(...(await page.locator('ul.list a strong').allInnerTexts()));
		const next = page.getByRole('button', { name: /Next/ });
		if (!(await next.isEnabled().catch(() => false))) break;
		await next.click();
	}
	console.log('ALL PROPERTY TITLES', JSON.stringify(all));
});
