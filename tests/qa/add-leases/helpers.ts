import { expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

export const SHOTS = 'openspec/changes/add-leases/qa/screenshots';
export const SCRATCH =
	'/tmp/claude-0/-home-user-svelte-property-management/b6fd1526-618f-54c8-bcdb-1d6a74c5bba2/scratchpad';
mkdirSync(SHOTS, { recursive: true });
mkdirSync(SCRATCH, { recursive: true });

export const ADMIN = {
	email: process.env.QA_ADMIN_EMAIL!,
	password: process.env.QA_ADMIN_PASSWORD!
};
export const TENANT = {
	email: process.env.QA_TENANT_EMAIL!,
	password: process.env.QA_TENANT_PASSWORD!
};

const STATE = `${SCRATCH}/state.json`;
export function loadState(): Record<string, any> {
	return existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
}
export function saveState(patch: Record<string, any>) {
	writeFileSync(STATE, JSON.stringify({ ...loadState(), ...patch }, null, 1));
}

export async function signIn(page: Page, account: { email: string; password: string }) {
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(account.email);
	await page.getByLabel('Password').fill(account.password);
	await expect(page.getByLabel('Email')).toHaveValue(account.email);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).not.toHaveURL(/\/signin/);
}

export async function newSession(
	browser: Browser,
	who: 'admin' | 'tenant'
): Promise<{ ctx: BrowserContext; page: Page }> {
	const ctx = await browser.newContext({ baseURL: 'https://lehman-realty-dev.web.app' });
	const page = await ctx.newPage();
	await signIn(page, who === 'admin' ? ADMIN : TENANT);
	await page.waitForLoadState('networkidle');
	return { ctx, page };
}

/** Hides real personal data (anything that is not a qa- example.com address, phone numbers, the owner's name) before a screenshot. */
export async function maskPersonalData(page: Page) {
	await page
		.evaluate(() => {
			const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
			const fix = (text: string) =>
				text
					.replace(email, (m) => (/^qa-[\w-]+@example\.com$/i.test(m) ? m : '<masked email>'))
					.replace(/\(\d{3}\) ?\d{3}-\d{4}/g, '<masked phone>')
					.replace(/\bcaleb\b( \w+)?/gi, 'Existing User');
			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
			const nodes: Text[] = [];
			while (walker.nextNode()) nodes.push(walker.currentNode as Text);
			for (const n of nodes)
				if (n.nodeValue) {
					const v = fix(n.nodeValue);
					if (v !== n.nodeValue) n.nodeValue = v;
				}
			for (const el of Array.from(document.querySelectorAll('input, textarea'))) {
				const i = el as HTMLInputElement;
				if (
					i.type === 'password' ||
					i.type === 'file' ||
					i.type === 'checkbox' ||
					i.type === 'radio' ||
					i.type === 'date' ||
					i.type === 'number'
				)
					continue;
				const v = fix(i.value ?? '');
				if (v !== i.value) {
					try {
						i.type = 'text';
					} catch {}
					i.value = v;
				}
			}
		})
		.catch(() => {});
}

export async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
	await maskPersonalData(page);
	await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: opts.fullPage ?? true });
}

/** YYYY-MM-DD for today in Indianapolis offset by months/days */
export function ymd(monthOffset = 0, day = 1) {
	const now = new Date(
		new Date().toLocaleString('en-US', { timeZone: 'America/Indiana/Indianapolis' })
	);
	const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, day);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const RUN =
	(loadState().run as string) ??
	(() => {
		const r = Date.now().toString(36);
		saveState({ run: r });
		return r;
	})();
export const email = (tag: string) => `qa-${RUN}-${tag}@example.com`;

export async function ready(page: Page) {
	await page.waitForLoadState('networkidle');
}

export async function createProperty(page: Page, title: string, rent: string, street: string) {
	await page.goto('/admin/properties/add');
	await ready(page);
	await page.getByTitle('Title', { exact: true }).fill(title);
	await page.getByTitle('Rent').fill(rent);
	await page.getByTitle('Description').fill('qa- property for lease QA');
	await page.getByTitle('Bedrooms').fill('2');
	await page.getByTitle('Bathrooms').fill('1');
	await page.getByTitle('Square Feet').fill('900');
	await page.getByTitle('Street Address').fill(street);
	await page.getByTitle('City').fill('Terre Haute');
	await page.getByTitle('State').fill('IN');
	await page.getByTitle('Zip Code').fill('47803');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page).toHaveURL(/\/admin\/properties\/[^/]+\/edit$/, { timeout: 30000 });
	return page.url().match(/properties\/([^/]+)\/edit/)![1];
}

export async function openLeasesTab(page: Page, propertyId: string) {
	await page.goto(`/admin/properties/${propertyId}/edit?tab=leases`);
	await ready(page);
}
export const leaseItems = (page: Page) =>
	page.getByRole('list', { name: 'Leases' }).locator(':scope > li');

export async function fillLease(
	page: Page,
	lease: { startDate?: string; endDate?: string; emails?: string[]; rent?: string }
) {
	if (lease.rent !== undefined) await page.getByLabel('Monthly rent').fill(lease.rent);
	if (lease.startDate !== undefined) await page.getByLabel('Start date').fill(lease.startDate);
	if (lease.endDate !== undefined) await page.getByLabel(/^End date/).fill(lease.endDate);
	for (const [index, e] of (lease.emails ?? []).entries()) {
		if (
			index > 0 &&
			(await page.getByLabel(`Tenant email ${index + 1}`, { exact: true }).count()) === 0
		)
			await page.getByRole('button', { name: 'Add tenant' }).click();
		await page.getByLabel(`Tenant email ${index + 1}`, { exact: true }).fill(e);
	}
}
export const PDF = Buffer.from('%PDF-1.4\n% qa- lease document\n%%EOF\n');
export async function saveLease(page: Page) {
	await page.getByRole('button', { name: 'Save lease' }).click();
}
export async function leaseIdsAt(page: Page, propertyId: string) {
	await openLeasesTab(page, propertyId);
	const hrefs = await page
		.locator(`a[href^="/admin/properties/${propertyId}/leases/"]`)
		.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
	return hrefs.filter((h) => !h.endsWith('/new')).map((h) => h.split('/').pop()!);
}

/** Pays `amount` against the qa- lease through Stripe test-mode Checkout and waits for the success page. */
export async function payA(page: Page, amount: string, addressLabel = '101 QA Alpha St') {
	page.setDefaultTimeout(20000);
	await page.goto('/payment');
	await ready(page);
	await page
		.getByRole('button', { name: new RegExp(`Make a Payment for ${addressLabel}`) })
		.click();
	await page.getByRole('dialog').locator('input').fill(amount);
	await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
	await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60000 });
	await page.waitForLoadState('networkidle').catch(() => {});
	await page.waitForTimeout(3000);
	await page
		.getByText('Card', { exact: true })
		.locator('visible=true')
		.first()
		.click({ force: true });
	await page.locator('#cardNumber').fill('4242424242424242');
	await page.locator('#cardExpiry').fill('1234');
	await page.locator('#cardCvc').fill('123');
	await page
		.locator('#enableStripePass')
		.uncheck()
		.catch(() => {});
	const nm = page.locator('#billingName');
	if (await nm.count()) await nm.fill('QA Tester');
	const zp = page.locator('#billingPostalCode');
	if (await zp.count()) await zp.fill('47803');
	await page.getByTestId('hosted-payment-submit-button').click();
	await page.waitForURL(/payment\/success/, { timeout: 120000 });
	await ready(page);
}

/** Deletes a qa- user through the admin Users page (search, row menu, confirm). Returns whether a row was found. */
export async function deleteUserByEmail(page: Page, address: string): Promise<boolean> {
	await page.goto('/admin/users');
	await ready(page);
	const search = page
		.getByRole('searchbox')
		.or(page.getByRole('textbox', { name: /search/i }))
		.first();
	await search.fill(address).catch(() => {});
	await page.waitForTimeout(800);
	const row = page.locator('tr, li').filter({ hasText: address }).first();
	if ((await row.count()) === 0) return false;
	await row.getByRole('button', { name: /Actions for/ }).click();
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	await page.getByRole('button', { name: 'Confirm' }).click();
	await page.waitForTimeout(2500);
	return true;
}
