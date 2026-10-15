import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from '../support/constants';
import { adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

// list-browsing: tables on wide screens, cards on phones, search, sort, empty and loading states.

const LOWER = { id: 'e2e-aardvark', firstName: 'Abe', lastName: 'aardvark' };
const EMPTY_PROPERTY = 'e2e-no-tenants-property';

test.beforeAll(async () => {
	const db = adminDb();
	// A lowercase last name: byte order would list it after every capitalized one.
	await db.doc(`users/${LOWER.id}`).set({
		email: 'abe@e2e.test',
		firstName: LOWER.firstName,
		lastName: LOWER.lastName,
		phoneNumber: '+15555550150',
		permissions: 'user'
	});
	await db.doc(`properties/${EMPTY_PROPERTY}`).set({
		title: 'E2E Vacant Court',
		description: 'No tenants',
		bedrooms: 1,
		bathrooms: 1,
		squareFeet: 400,
		rent: 600,
		streetAddress: '5 Main St',
		apartmentInfo: '',
		city: 'Terre Haute',
		state: 'IN',
		zip: '47802'
	});
});

async function openUsers(page: Page) {
	await signIn(page, ADMIN);
	await page.goto('/admin/users');
	await page.waitForLoadState('networkidle');
	return page.getByRole('table', { name: 'users' }).locator('tbody tr');
}

test.describe('list-browsing: responsive list layout', () => {
	test('Scenario: Desktop table', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		const rows = await openUsers(page);
		const table = page.getByRole('table', { name: 'users' });

		for (const name of ['Name', 'Email', 'Phone number']) {
			await expect(table.getByRole('columnheader', { name })).toBeVisible();
		}
		const row = rows.filter({ hasText: `${ADMIN.firstName} ${ADMIN.lastName}` });
		await expect(row).toContainText(ADMIN.email);
		await expect(row.getByRole('button', { name: /^Actions for / })).toBeVisible();
		await expect(row).toHaveCSS('display', 'table-row');
	});

	test('Scenario: Phone cards', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 800 });
		const rows = await openUsers(page);
		const row = rows.filter({ hasText: `${ADMIN.firstName} ${ADMIN.lastName}` });

		await expect(row).toHaveCSS('display', 'flex');
		await expect(row).toContainText(ADMIN.email);
		await expect(row.getByRole('button', { name: /^Actions for / })).toBeVisible();
		const overflows = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(overflows).toBe(false);
	});

	test('Scenario: No horizontal scroll on any page at phone, tablet and desktop widths', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		for (const width of [390, 768, 1280]) {
			await page.setViewportSize({ width, height: 800 });
			for (const path of [
				'/admin',
				'/admin/users',
				'/admin/properties',
				'/admin/maintenance',
				'/profile',
				`/admin/properties/${EMPTY_PROPERTY}/edit`
			]) {
				await page.goto(path);
				await page.waitForLoadState('networkidle');
				const overflow = await page.evaluate(() =>
					[document.documentElement, document.querySelector('main')].some(
						(el) => !!el && el.scrollWidth > el.clientWidth
					)
				);
				expect(overflow, `${path} at ${width}px`).toBe(false);
			}
		}
	});
});

test.describe('list-browsing: search lists in the browser', () => {
	test('Scenario: Filter users, then Clear search', async ({ page }) => {
		const rows = await openUsers(page);
		const all = await page.getByText(/Page 1 of \d+/).innerText();
		const search = page.getByRole('searchbox', { name: 'Search users' });

		await search.fill('AARDV');
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText('Abe aardvark');
		await expect(page.getByText('Page 1 of 1')).toBeVisible();

		await search.fill('');
		await expect(page.getByText(all)).toBeVisible();
		expect(await rows.count()).toBeGreaterThan(1);
	});
});

test.describe('list-browsing: sort lists in the browser', () => {
	test('Scenario: Sort by last name ignores capitalization', async ({ page }) => {
		const rows = await openUsers(page);
		const nameHeader = page.getByRole('columnheader', { name: 'Name' });
		await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
		// "aardvark" sorts before "Admin" although lowercase letters come after capitals in byte order.
		await expect(rows.first()).toContainText('Abe aardvark');

		await nameHeader.getByRole('button').click();
		await expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
		await expect(rows.first()).not.toContainText('Abe aardvark');
	});

	test('Scenario: Sort on cards', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 800 });
		const rows = await openUsers(page);
		const sortBy = page.getByLabel('Sort users by');

		await sortBy.selectOption({ label: 'Sort by email' });
		const emails = await rows.evaluateAll((trs) =>
			trs.map((tr) => tr.querySelectorAll('td')[1]?.textContent?.trim() ?? '')
		);
		expect(emails).toEqual(
			[...emails].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
		);
	});
});

test.describe('list-browsing: empty and no-result states', () => {
	test('Scenario: No rows', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto(`/admin/properties/${EMPTY_PROPERTY}/edit`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('tab', { name: 'Leases' }).click();

		await expect(page.getByText('No leases', { exact: true })).toBeVisible();
		await expect(page.getByRole('list', { name: 'Leases' })).toHaveCount(0);
	});

	test('Scenario: No rows on the properties page shows one Add property action', async ({
		page
	}) => {
		// Tests run one at a time (workers: 1), so the collection can be emptied and restored here.
		const db = adminDb();
		const saved = (await db.collection('properties').get()).docs.map((doc) => ({
			ref: doc.ref,
			data: doc.data()
		}));
		await Promise.all(saved.map(({ ref }) => ref.delete()));
		try {
			await signIn(page, ADMIN);
			await page.goto('/admin/properties');
			await page.waitForLoadState('networkidle');

			await expect(page.getByText('No properties yet')).toBeVisible();
			await expect(page.getByRole('table', { name: 'properties' })).toHaveCount(0);
			const add = page.getByRole('link', { name: 'Add Property' });
			await expect(add).toHaveCount(1);
			await add.click();
			await expect(page).toHaveURL(/\/admin\/properties\/add$/);
		} finally {
			await Promise.all(saved.map(({ ref, data }) => ref.set(data)));
		}
	});

	test('Scenario: No matches', async ({ page }) => {
		await openUsers(page);
		await page.getByRole('searchbox', { name: 'Search users' }).fill('zzzz-nobody');

		await expect(page.getByText('No results for “zzzz-nobody”.')).toBeVisible();
		await page.getByRole('button', { name: 'Show all users' }).click();
		await expect(page.getByRole('table', { name: 'users' })).toBeVisible();
	});
});

test.describe('list-browsing: loading placeholders', () => {
	test('Scenario: Navigating to a list', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		await page.route('**/admin/users/__data.json*', async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 1500));
			await route.continue();
		});

		await page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link', { name: 'Users' })
			.click();

		await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible();
		await expect(page.getByRole('table', { name: 'users' })).toBeVisible();
		await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0);
	});
});
