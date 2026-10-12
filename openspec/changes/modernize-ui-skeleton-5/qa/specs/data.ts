import { expect, type Page } from '@playwright/test';
import { hydrate } from './helpers';

export const QA_PROP = 'QA-Upper-Prop';
export const QA_USER_EMAIL = '<qa-owner-inbox>+qa-c3-remove@example.com';

export async function waitReady(page: Page) {
	await hydrate(page);
	await page.waitForTimeout(200);
}

/** Creates the qa- property through the UI if it is not there yet. */
export async function ensureQaProperty(page: Page) {
	await page.goto('/admin/properties');
	await waitReady(page);
	if ((await page.getByRole('link', { name: QA_PROP, exact: true }).count()) > 0) return;
	await page.goto('/admin/properties/add');
	await waitReady(page);
	await page.getByLabel('Title', { exact: true }).fill(QA_PROP);
	await page.getByLabel('Rent', { exact: true }).fill('1234');
	await page.getByLabel('Description').fill('qa test property');
	await page.getByLabel('Bedrooms').fill('2');
	await page.getByLabel('Bathrooms').fill('1');
	await page.getByLabel('Square Feet').fill('900');
	await page.getByLabel('Street Address').fill('1 QA Test Way');
	await page.getByLabel('City', { exact: true }).fill('Testville');
	await page.getByLabel('State', { exact: true }).fill('IN');
	await page.getByLabel('Zip Code').fill('47000');
	await page.getByRole('button', { name: 'Save' }).click();
	await page.waitForURL(/\/admin\/properties\/.+\/edit/, { timeout: 30000 });
}

export async function ensureQaUser(page: Page) {
	await page.goto('/admin/users');
	await waitReady(page);
	await page.getByPlaceholder('Search users').fill(QA_USER_EMAIL);
	if ((await page.locator('tbody tr', { hasText: QA_USER_EMAIL }).count()) > 0) return;
	await page.getByRole('button', { name: 'Add User' }).click();
	const dlg = page.getByRole('dialog');
	await dlg.getByRole('textbox').fill(QA_USER_EMAIL);
	await dlg.getByRole('button', { name: 'Submit' }).click();
	await expect(page.getByText('User Successfully Created.')).toBeVisible({ timeout: 30000 });
}

import { unflatten } from 'devalue';

/** Reads the (already authenticated) user's data for a page through SvelteKit's data endpoint. */
async function pageData(page: Page, route: string) {
	const res = await page.request.get(`${route}/__data.json`);
	expect(res.ok()).toBeTruthy();
	const json = await res.json();
	return json.nodes
		.filter((n: { type: string } | null) => n && n.type === 'data')
		.map((n: { data: unknown[] }) => unflatten(n.data)) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** The Firestore id of the qa- user, found read-only so a picker never grabs someone else's account. */
export async function qaUserId(page: Page) {
	const nodes = await pageData(page, '/admin/users');
	const users = nodes.map((n) => n.users).find(Boolean) as { id: string; data: { email: string } }[];
	const hit = users.find((u) => u.data.email === QA_USER_EMAIL);
	expect(hit, 'qa- user exists').toBeTruthy();
	return hit!.id;
}

export async function qaPropertyUrl(page: Page) {
	await page.goto('/admin/properties');
	await waitReady(page);
	const href = await page.getByRole('link', { name: QA_PROP, exact: true }).getAttribute('href');
	expect(href).toBeTruthy();
	return href!;
}

/** Adds the qa- user to the qa- property over the API when it is not assigned (setup for scenarios). */
export async function ensureQaTenantAssigned(page: Page) {
	const url = await qaPropertyUrl(page);
	const id = url.split('/')[3];
	const uid = await qaUserId(page);
	const nodes = await pageData(page, `/admin/properties/${id}/edit`);
	const tenants = (nodes.map((n) => n.tenants).find(Boolean) ?? []) as { id: string }[];
	if (tenants.some((t) => t.id === uid)) return url;
	const res = await page.request.post(`/api/property/${id}/tenants`, {
		data: { tenantId: uid, moveInMonth: '2026-10' }
	});
	expect(res.ok()).toBeTruthy();
	return url;
}

/** Id of the dedicated QA tenant account (matched by the email in the environment, never printed). */
async function qaTenantAccountId(page: Page) {
	const email = process.env.QA_TENANT_EMAIL;
	expect(email, 'QA_TENANT_EMAIL is set').toBeTruthy();
	const nodes = await pageData(page, '/admin/users');
	const users = nodes.map((n) => n.users).find(Boolean) as { id: string; data: { email: string } }[];
	const hit = users.find((u) => u.data.email === email);
	expect(hit, 'QA tenant account exists').toBeTruthy();
	return hit!.id;
}

/**
 * Links the QA tenant account to the qa- property (the junction document is the qa- data created
 * here and removed again in cleanup) so tenant pages that need a property can be loaded.
 */
export async function linkQaTenantAccount(page: Page, link: boolean) {
	const url = await qaPropertyUrl(page);
	const id = url.split('/')[3];
	const uid = await qaTenantAccountId(page);
	const nodes = await pageData(page, `/admin/properties/${id}/edit`);
	const tenants = (nodes.map((n) => n.tenants).find(Boolean) ?? []) as { id: string }[];
	const linked = tenants.some((t) => t.id === uid);
	if (link && !linked) {
		const res = await page.request.post(`/api/property/${id}/tenants`, {
			data: { tenantId: uid, moveInMonth: '2026-10' }
		});
		expect(res.ok(), 'link QA tenant account to qa- property').toBeTruthy();
	}
	if (!link && linked) {
		const res = await page.request.delete(`/api/property/${id}/tenants`, { data: { tenantId: uid } });
		expect(res.ok(), 'unlink QA tenant account').toBeTruthy();
	}
}
