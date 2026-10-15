import { expect, type Browser, type Page, type Locator } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

export const CHANGE = 'add-lease-proration-and-deposits';
export const SHOTS = path.resolve(process.cwd(), 'openspec/changes', CHANGE, 'qa/screenshots');

export type Role = 'admin' | 'tenant';

function creds(role: Role) {
	const email = process.env[role === 'admin' ? 'QA_ADMIN_EMAIL' : 'QA_TENANT_EMAIL'];
	const password = process.env[role === 'admin' ? 'QA_ADMIN_PASSWORD' : 'QA_TENANT_PASSWORD'];
	if (!email || !password) throw new Error(`QA ${role} credentials are missing from .env.qa`);
	return { email, password };
}

export function accountEmails() {
	return [process.env.QA_ADMIN_EMAIL, process.env.QA_TENANT_EMAIL].filter(Boolean) as string[];
}
export const tenantEmail = () => creds('tenant').email;
export const adminEmail = () => creds('admin').email;

export const BASE = process.env.BASE_URL?.trim() || 'https://lehman-realty-dev.web.app';

/** A fresh signed-in browser session for a role. */
export async function newSession(browser: Browser, role: Role) {
	const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
	const page = await context.newPage();
	await signIn(page, role);
	return page;
}

export const slug = (s: string) =>
	s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Normalised text of a lease entry on the admin Leases tab. */
export async function entryText(page: Page, start: string) {
	const li = leaseEntry(page, start);
	await expect(li).toBeVisible();
	return (await li.innerText()).replace(/\s+/g, ' ');
}

export async function signIn(page: Page, role: Role) {
	const { email, password } = creds(role);
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).not.toHaveURL(/\/signin/, { timeout: 30_000 });
}

/** Screenshot with every QA account email masked. */
export async function shot(page: Page, name: string, fullPage = true) {
	const mask: Locator[] = [];
	for (const email of accountEmails()) {
		mask.push(page.getByText(email, { exact: false }));
		mask.push(page.locator(`input[value="${email}"]`));
	}
	mask.push(page.locator('input[name="emails"]'));
	mask.push(page.locator('input[type="email"], input[type="password"]'));
	await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage, mask });
}

export async function createProperty(page: Page, title: string, rent = 1500, street = '1 QA Way') {
	await page.goto('/admin/properties/add');
	await page.waitForLoadState('networkidle');
	await page.locator('input[name="title"]').fill(title);
	await page.locator('input[name="rent"]').fill(String(rent));
	await page.locator('textarea[name="description"]').fill('qa property');
	await page.locator('input[name="bedrooms"]').fill('1');
	await page.locator('input[name="bathrooms"]').fill('1');
	await page.locator('input[name="squareFeet"]').fill('500');
	await page.locator('input[name="streetAddress"]').fill(street);
	await page.locator('input[name="city"]').fill('Indianapolis');
	await page.locator('input[name="state"]').fill('IN');
	await page.locator('input[name="zip"]').fill('46204');
	await page.getByRole('button', { name: 'Save' }).click();
	await page.waitForURL(/\/admin\/properties\/[^/]+\/edit/, { timeout: 30_000 });
	return page.url().match(/properties\/([^/]+)\/edit/)![1];
}

export type LeaseInput = {
	rent?: number | string;
	start: string;
	end?: string;
	deposit?: number | string;
	depositDue?: string;
	lateFee?: number | string;
	grace?: number | string;
	emails?: string[];
	who?: 'admin' | 'tenant';
};

export async function fillLease(page: Page, l: LeaseInput) {
	if (l.rent !== undefined) await page.locator('input[name="rent"]').fill(String(l.rent));
	await page.locator('input[name="startDate"]').fill(l.start);
	await page.locator('input[name="endDate"]').fill(l.end ?? '');
	await page.locator('input[name="deposit"]').fill(l.deposit === undefined ? '' : String(l.deposit));
	await page.locator('input[name="depositDueDate"]').fill(l.depositDue ?? '');
	if (l.lateFee !== undefined) await page.locator('input[name="lateFee"]').fill(String(l.lateFee));
	if (l.grace !== undefined) await page.locator('input[name="graceDays"]').fill(String(l.grace));
	const emails = l.emails ?? [l.who === 'admin' ? adminEmail() : tenantEmail()];
	const inputs = page.locator('input[name="emails"]');
	while ((await inputs.count()) < emails.length) {
		await page.getByRole('button', { name: 'Add tenant' }).click();
	}
	for (let i = 0; i < emails.length; i++) await inputs.nth(i).fill(emails[i]);
}

/** Create a lease through the admin form; returns its id. Confirms an overlap warning if shown. */
export async function createLease(page: Page, propertyId: string, l: LeaseInput) {
	await page.goto(`/admin/properties/${propertyId}/leases/new`);
	await page.waitForLoadState('networkidle');
	await fillLease(page, l);
	await page.getByRole('button', { name: 'Save lease' }).click();
	const saveAnyway = page.getByRole('button', { name: 'Save anyway' });
	await Promise.race([
		page.waitForURL(/tab=leases/, { timeout: 30_000 }),
		saveAnyway.waitFor({ timeout: 30_000 })
	]).catch(() => {});
	if (await saveAnyway.isVisible().catch(() => false)) await saveAnyway.click();
	await page.waitForURL(/tab=leases/, { timeout: 30_000 });
	const id = await findLeaseId(page, propertyId, l.start);
	return id;
}

/** Open the Leases tab and return the lease id of the entry that starts on `start`. */
export async function findLeaseId(page: Page, propertyId: string, start: string) {
	await page.goto(`/admin/properties/${propertyId}/edit?tab=leases`);
	await page.waitForLoadState('networkidle');
	const edit = page.getByRole('link', { name: `Edit lease from ${start}` });
	await expect(edit.first()).toBeVisible();
	const href = (await edit.first().getAttribute('href'))!;
	return href.split('/').pop()!;
}

export function leaseEntry(page: Page, start: string) {
	return page.locator('ul[aria-label="Leases"] > li').filter({ hasText: start }).first();
}

export async function openLeases(page: Page, propertyId: string) {
	await page.goto(`/admin/properties/${propertyId}/edit?tab=leases`);
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('heading', { name: 'Leases' })).toBeVisible();
}

export async function editLease(page: Page, propertyId: string, leaseId: string) {
	await page.goto(`/admin/properties/${propertyId}/leases/${leaseId}`);
	await page.waitForLoadState('networkidle');
}

export async function saveLease(page: Page) {
	await page.getByRole('button', { name: 'Save lease' }).click();
}

/** Ids of everything created, kept in a file so a later run can clean up. */
export const STATE_FILE = path.resolve(process.cwd(), 'tests/qa', CHANGE, '.state.json');

type State = { properties: string[]; leases: { id: string; propertyId: string }[] };
export function readState(): State {
	try {
		return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
	} catch {
		return { properties: [], leases: [] };
	}
}
export function remember(kind: 'property' | 'lease', id: string, propertyId = '') {
	const st = readState();
	if (kind === 'property') st.properties.push(id);
	else st.leases.push({ id, propertyId });
	fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 1));
}
export function forget(kind: 'property' | 'lease', id: string) {
	const st = readState();
	if (kind === 'property') st.properties = st.properties.filter((x) => x !== id);
	else st.leases = st.leases.filter((x) => x.id !== id);
	fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 1));
}

/** Create a qa- property and a lease on it; remembers both for cleanup. */
export async function setupLease(page: Page, tag: string, l: LeaseInput, propertyRent = 1500) {
	const propertyId = await createProperty(page, `qa-billing-${tag}`, propertyRent, `${tag} QA Way`);
	remember('property', propertyId);
	const leaseId = await createLease(page, propertyId, l);
	remember('lease', leaseId, propertyId);
	return { propertyId, leaseId };
}

/** Delete leases (then their property) that were created; returns the ids left because of payments. */
export async function cleanup(page: Page, leaseIds: string[], propertyIds: string[]) {
	const left: string[] = [];
	const blocked = new Set<string>();
	for (const id of leaseIds) {
		const res = await page.request.delete(`/api/lease/${id}`);
		if (res.ok() || res.status() === 404) forget('lease', id);
		else {
			left.push(id);
			const st = readState().leases.find((x) => x.id === id);
			if (st) blocked.add(st.propertyId);
		}
	}
	for (const id of propertyIds) {
		if (blocked.has(id)) continue;
		const res = await page.request.delete(`/api/property/${id}`);
		if (res.ok() || res.status() === 404) forget('property', id);
	}
	return left;
}

export const money = (n: number) =>
	n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** The tenant /payment block of one lease. */
export function paymentBlock(page: Page, leaseId: string) {
	return page.locator(`[data-lease="${leaseId}"]`);
}

/** Start a payment on /payment for a lease, and stop on the Stripe Checkout page. */
export async function startCheckout(page: Page, leaseId: string, amount: number | string) {
	await page.goto('/payment');
	await page.waitForLoadState('networkidle');
	const button = paymentBlock(page, leaseId).getByRole('button', { name: /Make a Payment/ });
	await expect(button).toBeVisible({ timeout: 30_000 });
	await button.scrollIntoViewIfNeeded();
	await button.click();
	await page.getByRole('dialog').locator('input').fill(String(amount));
	await page.getByRole('button', { name: 'Submit' }).click();
	await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
	await page.waitForLoadState('domcontentloaded');
}

/** Pay on the Checkout page with Stripe's test card. */
export async function payWithTestCard(page: Page) {
	const card = page.getByPlaceholder('1234 1234 1234 1234');
	if (!(await card.isVisible().catch(() => false))) {
		await page.getByTestId('card-accordion-item').click({ force: true, timeout: 20_000 });
	}
	await card.waitFor({ timeout: 30_000 });
	await card.fill('4242424242424242');
	await page.getByPlaceholder('MM / YY').fill('12 / 34');
	await page.getByPlaceholder('CVC').fill('123');
	const name = page.getByPlaceholder('Full name on card');
	if (await name.isVisible().catch(() => false)) await name.fill('QA Tester');
	const zip = page.getByPlaceholder('ZIP');
	if (await zip.isVisible().catch(() => false)) await zip.fill('46204');
	const pass = page.locator('#enableStripePass');
	if (await pass.isChecked().catch(() => false)) await pass.uncheck({ force: true });
	await page.getByTestId('hosted-payment-submit-button').click();
	await page.waitForURL(/\/payment\/success/, { timeout: 120_000 });
}

/** Poll until the admin Leases-tab entry text matches (webhook delivery can lag). */
export async function waitFor(page: Page, fn: () => Promise<boolean>, ms = 90_000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (await fn()) return true;
		await page.waitForTimeout(4000);
	}
	return false;
}
