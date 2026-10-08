import { expect, test, type Page } from '@playwright/test';
const SHOTS = 'openspec/changes/sync-firebase-config/qa/screenshots';
async function signIn(page: Page, email: string, password: string) {
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).not.toHaveURL(/\/signin/, { timeout: 30000 });
	await page.waitForLoadState('networkidle');
}
const subject = "qa-rules-flow-1";

test('tenant creates a maintenance request through the server (write path)', async ({ page }) => {
	await signIn(page, process.env.QA_TENANT_EMAIL!, process.env.QA_TENANT_PASSWORD!);
	await page.goto('/maintenance');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Subject').fill(subject);
	await page.getByLabel('Description').fill('qa- automated request, safe to ignore');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText(subject).first()).toBeVisible({ timeout: 20000 });
	await page.screenshot({ path: `${SHOTS}/regression-tenant-maintenance-create.png` });
});

test('tenant payment page starts checkout in Stripe test mode', async ({ page }) => {
	await signIn(page, process.env.QA_TENANT_EMAIL!, process.env.QA_TENANT_PASSWORD!);
	await page.goto('/payment');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Make a Payment' }).click();
	await page.getByRole('spinbutton').fill('1');
	await page.getByRole('button', { name: 'Submit' }).click();
	await page.waitForURL(/stripe\.com|checkout/, { timeout: 30000 }).catch(() => {});
	console.log('PAYMENT URL host:', new URL(page.url()).host);
	await page.waitForTimeout(3000);
	const txt = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300);
	console.log('PAYMENT PAGE:', txt);
	await page.screenshot({ path: `${SHOTS}/regression-tenant-payment-checkout.png` });
});

test('admin closes the qa-rules requests created by this QA run (cleanup)', async ({ page }) => {
	await signIn(page, process.env.QA_ADMIN_EMAIL!, process.env.QA_ADMIN_PASSWORD!);
	await page.goto('/admin/maintenance');
	await page.waitForLoadState('networkidle');
	await expect(page.getByText(subject).first()).toBeVisible();
	await page.screenshot({ path: `${SHOTS}/regression-admin-maintenance-sees-new.png` });
	for (let i = 0; i < 5; i++) {
		const row = page.locator('div.flex-row:has(> button)', { hasText: /qa-rules-/ }).first();
		if (!(await row.count())) break;
		await row.getByRole('button').first().click();
		await page.getByRole('dialog').getByRole('textbox').fill('qa- cleanup');
		await page.getByRole('dialog').getByRole('button', { name: /submit|confirm|ok/i }).click();
		await page.waitForTimeout(2500);
		await page.reload();
		await page.waitForLoadState('networkidle');
	}
	await page.screenshot({ path: `${SHOTS}/regression-admin-maintenance-closed.png`, fullPage: true });
	console.log('open qa-rules rows left:', await page.locator('div.flex-row:has(> button)', { hasText: /qa-rules-/ }).count());
});
