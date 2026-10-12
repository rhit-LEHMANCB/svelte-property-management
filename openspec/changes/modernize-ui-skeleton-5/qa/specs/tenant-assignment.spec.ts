import { expect, test, type Page } from '@playwright/test';
import { shot, signIn } from './helpers';
import { QA_USER_EMAIL, ensureQaTenantAssigned, waitReady } from './data';

test.describe.configure({ mode: 'default' });

let page: Page;
let propertyUrl: string;

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
	await signIn(page, 'admin');
});
test.afterAll(async () => {
	await page.context().close();
});

const OPEN_DIALOG = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

async function openTenants() {
	propertyUrl = await ensureQaTenantAssigned(page);
	await page.goto(propertyUrl);
	await waitReady(page);
	await page.getByRole('tab', { name: 'Tenants' }).click();
	const row = page.locator('tbody tr', { hasText: QA_USER_EMAIL });
	await expect(row).toBeVisible();
	return row;
}

test('Remove-tenant control opens only its confirmation: Cancel removal', async () => {
	const row = await openTenants();
	await row.getByRole('button', { name: /^Remove .* from this property$/ }).click();
	const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'));
	await expect(confirm).toHaveCount(1);
	await expect(confirm).toBeVisible();
	await expect(confirm).toHaveAccessibleName('Please Confirm');
	await expect(confirm).toContainText('remove New User from this property');
	// only the confirmation: no user-info dialog (it has a tablist and the user's details)
	await expect(page.locator(OPEN_DIALOG)).toHaveCount(1);
	await expect(page.getByRole('tablist')).toHaveCount(0);
	await shot(page, 'tenant-assignment-cancel-removal');
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.locator(OPEN_DIALOG)).toHaveCount(0);
	await page.waitForTimeout(1200);
	await expect(page.locator(OPEN_DIALOG)).toHaveCount(0);
	await expect(row).toBeVisible();
});

test('Remove-tenant control opens only its confirmation: Open the row', async () => {
	const row = await openTenants();
	await row.getByRole('button', { name: 'New User' }).first().click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog).toHaveAccessibleName('New User');
	await expect(dialog.getByRole('tablist')).toBeVisible();
	await expect(dialog).toContainText(QA_USER_EMAIL);
	await shot(page, 'tenant-assignment-open-the-row');
	await page.keyboard.press('Escape');
	await expect(page.locator(OPEN_DIALOG)).toHaveCount(0);
});

test('Remove-tenant control opens only its confirmation: No nested interactive controls', async () => {
	const row = await openTenants();
	const nested = await row.evaluate((tr) => {
		const interactive = 'button, a[href], [role="button"], [role="link"], input, select, textarea, summary';
		const found: string[] = [];
		for (const el of Array.from(tr.querySelectorAll(interactive))) {
			const parent = el.parentElement?.closest(interactive);
			if (parent && tr.contains(parent)) found.push(`${el.tagName} inside ${parent.tagName}`);
		}
		const buttons = Array.from(tr.querySelectorAll('button'));
		return { found, buttons: buttons.map((b) => b.getAttribute('aria-label') || b.textContent!.trim()) };
	});
	console.log('row controls:', JSON.stringify(nested.buttons));
	expect(nested.found).toEqual([]);
	const nameBtn = row.getByRole('button', { name: 'New User' }).first();
	const removeBtn = row.getByRole('button', { name: /^Remove .* from this property$/ });
	await expect(nameBtn).toBeVisible();
	await expect(removeBtn).toBeVisible();
	// separate tab stops
	await nameBtn.focus();
	// separate tab stops: Tab from the name button reaches the month field's parts, then the remove button
	let reached = false;
	for (let i = 0; i < 8 && !reached; i++) {
		await page.keyboard.press('Tab');
		reached = await removeBtn.evaluate((el) => el === document.activeElement);
	}
	expect(reached, 'remove button is its own tab stop').toBe(true);
	await expect(removeBtn).toBeFocused();
	await shot(page, 'tenant-assignment-no-nested-interactive-controls');
});

test('Remove-tenant control opens only its confirmation: Confirm removal', async () => {
	const row = await openTenants();
	await row.getByRole('button', { name: /^Remove .* from this property$/ }).click();
	const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'));
	await expect(confirm).toBeVisible();
	await confirm.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByText('User successfully removed from property.')).toBeVisible();
	await expect(page.locator('tbody tr', { hasText: QA_USER_EMAIL })).toHaveCount(0);
	// nothing opens afterwards
	await page.waitForTimeout(1500);
	await expect(page.locator(OPEN_DIALOG)).toHaveCount(0);
	await expect(page.getByRole('tablist')).toHaveCount(1); // only the page's own tabs
	await shot(page, 'tenant-assignment-confirm-removal');
});
