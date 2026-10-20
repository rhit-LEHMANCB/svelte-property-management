import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
export { signInAs } from '../add-autopay/support';

// The values in .env.qa can carry trailing spaces; trim them without ever printing them.
for (const k of ['QA_ADMIN_EMAIL', 'QA_ADMIN_PASSWORD', 'QA_TENANT_EMAIL', 'QA_TENANT_PASSWORD'])
	if (process.env[k]) process.env[k] = process.env[k]!.trim();

export const SHOTS = 'openspec/changes/protect-paid-leases-from-delete/qa/screenshots';
const STATE = '/tmp/claude-0/-home-user-svelte-property-management/2fca0ce2-d7b5-5b50-8e76-545b52c5b1e7/scratchpad/qa-protect-state.json';
export const json = { 'Content-Type': 'application/json' };

export type Seed = Record<string, { propertyId: string; leaseId?: string; title: string }>;
export const loadSeed = (): Seed => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {});
export const saveSeed = (s: Seed) => writeFileSync(STATE, JSON.stringify(s, null, 1));

export async function shot(page: Page, slug: string, target?: Locator, full = false) {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.waitForTimeout(400);
	const path = `${SHOTS}/${slug}.png`;
	const mask = [page.getByText(/@/), page.locator('input[type="email"]')];
	if (target) await target.screenshot({ path, mask, type: 'png' });
	else await page.screenshot({ path, fullPage: full, mask, type: 'png' });
}

export async function createProperty(page: Page, title: string) {
	await page.goto('/admin/properties/add');
	await page.waitForLoadState('networkidle');
	const set = async (name: string, v: string) => page.locator(`[name="${name}"]`).fill(v);
	await set('title', title);
	await set('rent', '100');
	await set('description', 'qa test property, safe to delete');
	await set('bedrooms', '1');
	await set('bathrooms', '1');
	await set('squareFeet', '500');
	await set('streetAddress', '1 QA Way');
	await set('city', 'Terre Haute');
	await set('state', 'IN');
	await set('zip', '47802');
	await page.getByRole('button', { name: 'Save' }).click();
	await page.waitForURL(/\/admin\/properties\/[^/]+\/edit/, { timeout: 30_000 });
	const id = new URL(page.url()).pathname.split('/')[3];
	expect(id).toBeTruthy();
	return id;
}

export async function createLease(
	page: Page,
	propertyId: string,
	o: { start: string; end?: string; deposit?: string; lateFee?: string; email?: string }
) {
	await page.goto(`/admin/properties/${propertyId}/leases/new`);
	await page.waitForLoadState('networkidle');
	await page.locator('[name="rent"]').fill('100');
	await page.locator('[name="startDate"]').fill(o.start);
	if (o.end) await page.locator('[name="endDate"]').fill(o.end);
	if (o.deposit) await page.locator('[name="deposit"]').fill(o.deposit);
	if (o.lateFee) await page.locator('[name="lateFee"]').fill(o.lateFee);
	await page.locator('[name="emails"]').first().fill(o.email ?? process.env.QA_TENANT_EMAIL!);
	await page.getByRole('button', { name: 'Save lease' }).click();
	await page.waitForTimeout(6000);
	if (page.url().includes('/leases/new')) {
		const txt = (await page.locator('main').innerText()).replace(/\S+@\S+/g, '<email>').replace(/\s+/g, ' ');
		throw new Error('lease not saved: ' + txt.slice(0, 400));
	}
	let href: string | null = null;
	for (let i = 0; i < 5 && !href; i++) {
		await page.goto(`/admin/properties/${propertyId}/edit?tab=leases`);
		await page.waitForLoadState('networkidle');
		href = await page.getByRole('link', { name: /^Edit lease from/ }).first().getAttribute('href', { timeout: 5000 }).catch(() => null);
	}
	return href!.split('/').pop()!;
}

export async function deleteLeasePage(page: Page, propertyId: string, leaseId: string) {
	await page.goto(`/admin/properties/${propertyId}/leases/${leaseId}`);
	await page.waitForLoadState('networkidle');
}

export const leaseCard = (page: Page, id: string) => page.locator(`[data-lease="${id}"]`);

export async function payOnePound(page: Page, leaseId: string, amount: string) {
	await page.goto('/payment');
	await page.waitForLoadState('networkidle');
	await leaseCard(page, leaseId).getByRole('button', { name: /Make a Payment/ }).click();
	const dlg = page.locator('[data-payment-dialog]');
	await expect(dlg).toBeVisible();
	await dlg.getByLabel('Amount').fill(amount);
	await dlg.locator('input[value="card"]').check();
	await dlg.getByRole('button', { name: 'Continue to payment' }).click();
	await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
	await expect(page.getByText('Transaction Fee').first()).toBeVisible({ timeout: 45_000 });
	await page.waitForTimeout(3000);
	if (await page.getByPlaceholder(/1234 1234/).count()) {
		await page.getByPlaceholder(/1234 1234/).fill('4242 4242 4242 4242');
		await page.getByPlaceholder('MM / YY').fill('12 / 34');
		await page.getByPlaceholder('CVC').fill('123');
		const name = page.getByPlaceholder(/full name on card/i);
		if (await name.count()) await name.fill('QA Tenant');
	}
	await page.getByTestId('hosted-payment-submit-button').click({ timeout: 30_000 });
	await page.waitForURL(/lehman-realty-dev\.web\.app/, { timeout: 90_000 });
}

export async function deleteViaMenu(page: Page, title: string) {
	await searchList(page, title);
	await page.getByRole('button', { name: `Actions for ${title}`, exact: true }).click();
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	await page.getByRole('button', { name: 'Confirm' }).click();
}

/** The properties list is paged, so find a property through the search box. */
export async function searchList(page: Page, text: string) {
	await page.goto('/admin/properties');
	await page.waitForLoadState('networkidle');
	await page.getByPlaceholder('Search properties').fill(text);
	await page.waitForTimeout(500);
}
