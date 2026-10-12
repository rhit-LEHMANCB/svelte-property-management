import { expect, test, type Page } from '@playwright/test';
import { shot, signIn } from './helpers';
import { QA_PROP, waitReady } from './data';
import { parse, stringify } from 'devalue';
void parse;

let page: Page;

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext()).newPage();
	await signIn(page, 'admin');
});
test.afterAll(async () => {
	await page.context().close();
});

async function users(width = 1280, height = 800) {
	await page.setViewportSize({ width, height });
	await page.goto('/admin/users');
	await waitReady(page);
}

const names = () => page.locator('tbody tr strong').allInnerTexts();
const hasHorizontalScroll = () =>
	page.evaluate(() => {
		const main = document.querySelector('main');
		return {
			doc: document.documentElement.scrollWidth > document.documentElement.clientWidth,
			body: document.body.scrollWidth > document.body.clientWidth,
			main: !!main && main.scrollWidth > main.clientWidth
		};
	});

test('Responsive list layout: Desktop table', async () => {
	await users(1280);
	const table = page.getByRole('table', { name: 'users' });
	await expect(table).toBeVisible();
	for (const h of ['Name', 'Email', 'Phone number']) {
		await expect(table.getByRole('columnheader', { name: h })).toBeVisible();
	}
	const rows = table.locator('tbody tr');
	expect(await rows.count()).toBeGreaterThanOrEqual(4);
	const caleb = rows.filter({ hasText: 'Caleb Lehman' });
	await expect(caleb).toContainText('<qa-owner-inbox>@example.com');
	await expect(caleb).toContainText('(574) 310-9992');
	await expect(caleb.getByRole('button', { name: 'Actions for Caleb Lehman' })).toBeVisible();
	// real table layout
	expect(await rows.first().evaluate((el) => getComputedStyle(el).display)).toBe('table-row');
	expect(Object.values(await hasHorizontalScroll())).toEqual([false, false, false]);
	await shot(page, 'list-browsing-desktop-table');
});

test('Responsive list layout: Phone cards', async () => {
	await users(390, 844);
	const rows = page.locator('tbody tr');
	expect(await rows.count()).toBeGreaterThanOrEqual(4);
	// stacked cards, not table rows; headers are not shown as a header row
	expect(await rows.first().evaluate((el) => getComputedStyle(el).display)).toBe('flex');
	expect(await page.locator('thead').evaluate((el) => el.getBoundingClientRect().width <= 1 || el.getBoundingClientRect().height <= 1)).toBe(true);
	const caleb = rows.filter({ hasText: 'Caleb Lehman' });
	await expect(caleb).toContainText('<qa-owner-inbox>@example.com');
	await expect(caleb).toContainText('(574) 310-9992');
	// below md each cell carries its column label as CSS content from a data-label attribute
	await expect(caleb.locator('td[data-label="Email"]')).toBeVisible();
	await expect(caleb.locator('td[data-label="Phone number"]')).toBeVisible();
	await expect(caleb.getByRole('button', { name: 'Actions for Caleb Lehman' })).toBeVisible();
	// every card keeps the same actions
	expect(await page.locator('tbody tr button[aria-label^="Actions for"]').count()).toBe(await rows.count());
	expect(Object.values(await hasHorizontalScroll())).toEqual([false, false, false]);
	await shot(page, 'list-browsing-phone-cards');
	// the other two lists at phone width: no horizontal scroll either
	for (const url of ['/admin/properties', '/admin/maintenance']) {
		await page.goto(url);
		await waitReady(page);
		expect(Object.values(await hasHorizontalScroll()), url).toEqual([false, false, false]);
	}
});

test('Search lists in the browser: Filter users', async () => {
	await users(1280);
	const total = await page.locator('tbody tr').count();
	const size = page.getByLabel('Items per page');
	await size.selectOption('1');
	const nav = page.getByRole('navigation', { name: 'Pages of users' });
	await expect(nav.getByText(`Page 1 of ${total}`)).toBeVisible();
	await nav.getByRole('button', { name: 'Next page' }).click();
	await expect(nav.getByText(`Page 2 of ${total}`)).toBeVisible();
	const search = page.getByRole('searchbox', { name: 'Search users' });
	await expect(search).toBeVisible();
	const requests: string[] = [];
	const onReq = (r: { url(): string; resourceType(): string }) => {
		if (['fetch', 'xhr', 'document'].includes(r.resourceType())) requests.push(`${r.resourceType()} ${r.url()}`);
	};
	page.on('request', onReq);
	// matches the 3 "New User" rows by their last name, typed in upper case: case-insensitive. The page
	// resets from 2 to 1 and the page count reflects the matches (3 rows, 1 per page).
	await search.pressSequentially('USER', { delay: 60 });
	await expect(page.locator('tbody tr')).toHaveCount(1);
	await expect(page.locator('tbody tr')).toContainText('New User');
	await expect(nav.getByText('Page 1 of 3')).toBeVisible();
	// narrowing to one user
	await search.fill('ADMIN');
	await expect(page.locator('tbody tr')).toContainText('QA Admin');
	await expect(nav.getByText('Page 1 of 1')).toBeVisible();
	await page.waitForTimeout(500);
	page.off('request', onReq);
	expect(requests, 'no server request while filtering').toEqual([]);
	await shot(page, 'list-browsing-filter-users');
	await size.selectOption('10');
});

test('Search lists in the browser: Clear search', async () => {
	await users(1280);
	const total = await page.locator('tbody tr').count();
	await page.getByLabel('Items per page').selectOption('10');
	const search = page.getByRole('searchbox', { name: 'Search users' });
	await search.fill('admin');
	await expect(page.locator('tbody tr')).toHaveCount(1);
	await page.getByRole('button', { name: 'Clear search' }).click();
	await expect(search).toHaveValue('');
	await expect(page.locator('tbody tr')).toHaveCount(total);
	// clearing by hand works too
	await search.fill('admin');
	await expect(page.locator('tbody tr')).toHaveCount(1);
	await search.fill('');
	await expect(page.locator('tbody tr')).toHaveCount(total);
	await shot(page, 'list-browsing-clear-search');
});

// Last name as shown ("First Last"): the sort key is last name then first name.
const lastNames = async () => (await names()).map((n) => n.trim().split(/\s+/).slice(-1)[0]);
const ci = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

test('Sort lists in the browser: Sort by last name', async () => {
	await users(1280);
	await page.getByLabel('Items per page').selectOption('10');
	const th = page.getByRole('columnheader', { name: 'Name' });
	const sortBtn = th.getByRole('button', { name: 'Name' });
	// default is ascending on name
	await expect(th).toHaveAttribute('aria-sort', 'ascending');
	let last = await lastNames();
	expect(last).toEqual([...last].sort(ci));
	await sortBtn.click();
	await expect(th).toHaveAttribute('aria-sort', 'descending');
	last = await lastNames();
	expect(last).toEqual([...last].sort(ci).reverse());
	await sortBtn.click();
	await expect(th).toHaveAttribute('aria-sort', 'ascending');
	const emailTh = page.getByRole('columnheader', { name: 'Email' });
	await expect(emailTh).toHaveAttribute('aria-sort', 'none');
	await emailTh.getByRole('button').click();
	await expect(emailTh).toHaveAttribute('aria-sort', 'ascending');
	await expect(th).toHaveAttribute('aria-sort', 'none');
	await shot(page, 'list-browsing-sort-by-last-name');
});

test('Sort lists in the browser: names sort without regard to capitalization (properties)', async () => {
	// The user list has no lower-case last name to prove this with, so the same sort is checked on the
	// property title: existing "boom" (lower case) must sort before "QA-Upper-Prop" (upper case Q).
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/admin/properties');
	await waitReady(page);
	await page.getByLabel('Items per page').selectOption('10');
	const th = page.getByRole('columnheader', { name: 'Property' });
	await expect(th).toHaveAttribute('aria-sort', 'ascending');
	const titles = async () => (await page.locator('tbody tr a span').allInnerTexts()).map((t) => t.trim());
	const asc = await titles();
	expect(asc).toContain('boom');
	expect(asc).toContain(QA_PROP);
	expect(asc.indexOf('boom')).toBeLessThan(asc.indexOf(QA_PROP));
	await th.getByRole('button').click();
	const desc = await titles();
	expect(desc.indexOf(QA_PROP)).toBeLessThan(desc.indexOf('boom'));
	await th.getByRole('button').click();
	await shot(page, 'list-browsing-sort-capitalization');
});

test('Sort lists in the browser: Sort on cards', async () => {
	await users(390, 844);
	await page.getByLabel('Items per page').selectOption('10');
	const select = page.getByLabel('Sort users by');
	await expect(select).toBeVisible();
	await select.selectOption({ label: 'Sort by email' });
	const emails = async () =>
		(await page.locator('tbody tr').allInnerTexts()).map((t) => t.match(/\S+@\S+/)![0]);
	let list = await emails();
	expect(list).toEqual([...list].sort(ci));
	const dir = page.getByRole('button', { name: 'Sort descending' });
	await dir.click();
	list = await emails();
	expect(list).toEqual([...list].sort(ci).reverse());
	await expect(page.getByRole('button', { name: 'Sort ascending' })).toBeVisible();
	await shot(page, 'list-browsing-sort-on-cards');
});

test('Empty and no-result states: No matches', async () => {
	await users(1280);
	const search = page.getByRole('searchbox', { name: 'Search users' });
	await search.fill('zzzzqq');
	const msg = page.getByRole('status').filter({ hasText: 'No results' });
	await expect(msg).toBeVisible();
	await expect(msg).toContainText('zzzzqq');
	await expect(page.locator('tbody tr')).toHaveCount(0);
	const clear = msg.getByRole('button');
	await expect(clear).toBeVisible();
	await shot(page, 'list-browsing-no-matches');
	await clear.click();
	await expect(search).toHaveValue('');
	expect(await page.locator('tbody tr').count()).toBeGreaterThanOrEqual(4);
});

test('Empty and no-result states: No rows (properties, response simulated)', async () => {
	// A real empty properties list would need deleting the existing non-qa property, which QA must not
	// do. The data response for the page is replaced with an empty list, so this proves the empty state
	// rendering only, not a genuinely empty account.
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/admin');
	await waitReady(page);
	await page.route('**/admin/properties/__data.json*', async (route) => {
		const res = await route.fetch();
		const json = await res.json();
		const { unflatten } = await import('devalue');
		for (const node of json.nodes) {
			if (node && node.type === 'data') {
				const obj = unflatten(node.data) as Record<string, unknown>;
				if (obj && Array.isArray(obj.properties)) {
					obj.properties = [];
					node.data = JSON.parse(stringify(obj));
				}
			}
		}
		await route.fulfill({ response: res, json });
	});
	await page.getByRole('link', { name: 'Properties' }).first().click();
	await expect(page).toHaveURL(/\/admin\/properties$/);
	await expect(page.getByText('No properties yet')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Add Property' })).toBeVisible();
	await expect(page.locator('tbody tr')).toHaveCount(0);
	await shot(page, 'list-browsing-no-rows');
	await page.unroute('**/admin/properties/__data.json*');
});

test('Loading placeholders: Navigating to a list', async () => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/admin');
	await waitReady(page);
	await page.route('**/admin/users/__data.json*', async (route) => {
		await new Promise((r) => setTimeout(r, 3000));
		await route.continue();
	});
	await page.getByRole('link', { name: 'Users' }).first().click();
	const placeholder = page.getByRole('status', { name: 'Loading' });
	await expect(placeholder).toBeVisible({ timeout: 2500 });
	const before = await page.evaluate(() => {
		const m = document.querySelector('main')!.getBoundingClientRect();
		const h = document.querySelector('main .placeholder')!.getBoundingClientRect();
		const card = document.querySelector('main .card')!.getBoundingClientRect();
		return { mainTop: m.top, headTop: h.top, cardTop: card.top, cardLeft: card.left };
	});
	await shot(page, 'list-browsing-loading-placeholders');
	await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible({ timeout: 10000 });
	await expect(page.locator('tbody tr').first()).toBeVisible();
	await expect(placeholder).toBeHidden();
	const after = await page.evaluate(() => {
		const h = document.querySelector('main h1')!.getBoundingClientRect();
		return { h1Top: h.top, h1Height: h.height };
	});
	console.log('layout: placeholder', JSON.stringify(before), 'content', JSON.stringify(after));
	// the heading placeholder and the heading start at the same y (no vertical jump of the page start)
	expect(Math.abs(before.headTop - after.h1Top)).toBeLessThanOrEqual(8);
	await page.unroute('**/admin/users/__data.json*');
});

test('Pagination of lists keeps working: More than one page', async () => {
	await users(1280);
	await page.getByLabel('Items per page').selectOption('2');
	const nav = page.getByRole('navigation', { name: 'Pages of users' });
	await expect(nav.getByText(/Page 1 of 3/)).toBeVisible();
	const first = await names();
	expect(first).toHaveLength(2);
	await nav.getByRole('button', { name: 'Next page' }).click();
	await expect(nav.getByText(/Page 2 of 3/)).toBeVisible();
	const second = await names();
	expect(second).toHaveLength(2);
	expect(second).not.toEqual(first);
	await shot(page, 'list-browsing-more-than-one-page');
	await page.getByLabel('Items per page').selectOption('10');
});
