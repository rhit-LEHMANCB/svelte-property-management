import { expect, test } from '@playwright/test';
import { ADMIN, TENANT } from '../support/constants';
import { adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

// Data-integrity fixes (#38, #39): one property per tenant and a clean property delete.

const PROPERTY_A = 'e2e-di-property-a';
const PROPERTY_B = 'e2e-di-property-b';
const TENANT_ID = 'e2e-di-tenant';

const property = (title: string) => ({
	title,
	description: 'Data integrity test property',
	bedrooms: 1,
	bathrooms: 1,
	squareFeet: 500,
	rent: 800,
	streetAddress: '3 Main St',
	apartmentInfo: '',
	city: 'Terre Haute',
	state: 'IN',
	zip: '47802'
});

test.describe('tenant-assignment: one property per tenant', () => {
	test.beforeAll(async () => {
		const db = adminDb();
		await db.doc(`properties/${PROPERTY_A}`).set(property('DI Property A'));
		await db.doc(`properties/${PROPERTY_B}`).set(property('DI Property B'));
		await db.doc(`users/${TENANT_ID}`).set({
			email: 'di-tenant@e2e.test',
			firstName: 'Dana',
			lastName: 'Zzintegrity',
			phoneNumber: '+15555550143',
			permissions: 'user'
		});
		await db.doc(`junction_user_property/${TENANT_ID}_${PROPERTY_A}`).set({
			tenantId: TENANT_ID,
			propertyId: PROPERTY_A,
			moveInMonth: '2026-05'
		});
	});

	test('Scenario: Second assignment is rejected with 409 and the dropdown does not offer the tenant', async ({
		page
	}) => {
		await page.route('**/maps.googleapis.com/**', (route) => route.abort());
		await signIn(page, ADMIN);

		// The assignable list on the other property does not include the assigned tenant or admins.
		await page.goto(`/admin/properties/${PROPERTY_B}/edit`);
		await page.waitForLoadState('networkidle');
		await page.getByText('Tenants', { exact: true }).click();
		await page.getByPlaceholder('Search...').fill('Dana');
		await expect(page.getByRole('button', { name: 'Dana Zzintegrity' })).toHaveCount(0);
		await page.getByPlaceholder('Search...').fill('Ada');
		await expect(page.getByRole('button', { name: 'Ada Admin' })).toHaveCount(0);

		// A direct request is still rejected by the server.
		const status = await page.evaluate(
			async ({ url, tenantId }) =>
				(
					await fetch(url, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ tenantId })
					})
				).status,
			{ url: `/api/property/${PROPERTY_B}/tenants`, tenantId: TENANT_ID }
		);
		expect(status).toBe(409);
		expect(
			(await adminDb().doc(`junction_user_property/${TENANT_ID}_${PROPERTY_B}`).get()).exists
		).toBe(false);
	});
});

test.describe('property-management: delete removes tenant links and payment history', () => {
	const DELETE_PROPERTY = 'e2e-di-delete-property';

	test('Scenario: Deleted property with tenants leaves no junction or payment history', async ({
		page
	}) => {
		const db = adminDb();
		await db.doc(`properties/${DELETE_PROPERTY}`).set(property('DI Delete Me'));
		await db.doc(`junction_user_property/e2e-di-gone_${DELETE_PROPERTY}`).set({
			tenantId: 'e2e-di-gone',
			propertyId: DELETE_PROPERTY,
			moveInMonth: '2026-05'
		});
		await db
			.doc(`properties/${DELETE_PROPERTY}/payment_history/2026`)
			.set({ August: { remainingBalance: 0 } });
		await signIn(page, ADMIN);

		await page.goto('/admin');
		await page.waitForLoadState('networkidle');
		const status = await page.evaluate(
			async (url) => (await fetch(url, { method: 'DELETE' })).status,
			`/api/property/${DELETE_PROPERTY}`
		);

		expect(status).toBe(200);
		expect((await db.doc(`properties/${DELETE_PROPERTY}`).get()).exists).toBe(false);
		expect(
			(await db.doc(`junction_user_property/e2e-di-gone_${DELETE_PROPERTY}`).get()).exists
		).toBe(false);
		expect((await db.doc(`properties/${DELETE_PROPERTY}/payment_history/2026`).get()).exists).toBe(
			false
		);
	});
});

// #58: input and clicks before Svelte hydrates. The app's scripts are held back so the
// server-rendered page is on screen, but not yet interactive, for long enough to act on it.
const holdScripts = async (page: import('@playwright/test').Page, ms = 2500) =>
	page.route('**/_app/immutable/**/*.js', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, ms));
		await route.continue();
	});

test.describe('authentication: sign-in before hydration', () => {
	test('Scenario: Submit before hydration signs in through the POST form', async ({ page }) => {
		await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
		await page.goto('/signin');

		await page.getByLabel('Email').fill(TENANT.email);
		await page.getByLabel('Password').fill(TENANT.password);
		await page.getByLabel('Password').press('Enter');

		await expect(page).not.toHaveURL(/\/signin/);
		expect((await page.context().cookies()).some((c) => c.name === '__session')).toBe(true);
	});

	test('Scenario: Wrong credentials on the POST form show the error and keep the email', async ({
		page
	}) => {
		await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
		await page.goto('/signin');

		await page.getByLabel('Email').fill(TENANT.email);
		await page.getByLabel('Password').fill('not-the-password');
		await page.getByLabel('Password').press('Enter');

		await expect(page.getByRole('alert')).toHaveText('Your email or password is incorrect.');
		await expect(page.getByLabel('Email')).toHaveValue(TENANT.email);
	});

	test('Scenario: Typed early values survive hydration and the spinner button then works', async ({
		page
	}) => {
		await holdScripts(page);
		await page.goto('/signin', { waitUntil: 'domcontentloaded' });
		const button = page.getByRole('button', { name: 'Sign in' });

		await expect(button).toHaveCSS('pointer-events', 'none');
		await page.getByLabel('Email').fill(TENANT.email);
		await page.getByLabel('Password').fill(TENANT.password);
		await expect(page.locator('html')).not.toHaveAttribute('data-hydrated', '');

		await expect(page.locator('html')).toHaveAttribute('data-hydrated', '');
		await expect(page.getByLabel('Email')).toHaveValue(TENANT.email);
		await expect(page.getByLabel('Password')).toHaveValue(TENANT.password);
		await expect(button).toHaveCSS('pointer-events', 'auto');
		await button.click();

		await expect(page).not.toHaveURL(/\/signin/);
	});
});

test.describe('app-platform: no scripts', () => {
	test('Scenario: the Sign in button is clickable and signs in without JavaScript', async ({
		browser
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/signin');
		const button = page.getByRole('button', { name: 'Sign in' });

		await expect(button).toHaveCSS('pointer-events', 'auto');
		await page.getByLabel('Email').fill(TENANT.email);
		await page.getByLabel('Password').fill(TENANT.password);
		await button.click();

		await expect(page).not.toHaveURL(/\/signin/);
		await context.close();
	});
});

test.describe('app-platform: controls wait for hydration', () => {
	test('Scenario: Make a Payment is inert with a spinner until hydration, then opens its dialog', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await holdScripts(page);
		await page.goto('/payment', { waitUntil: 'domcontentloaded' });
		const button = page.getByRole('button', { name: 'Make a Payment' }).first();

		await expect(button).toHaveCSS('pointer-events', 'none');
		await expect(page.locator('html')).not.toHaveAttribute('data-hydrated', '');

		await expect(page.locator('html')).toHaveAttribute('data-hydrated', '');
		await expect(button).toHaveCSS('pointer-events', 'auto');
		await button.click();
		await expect(page.getByRole('dialog')).toBeVisible();
	});

	test('Scenario: Add User (a dialog trigger) is inert until hydration', async ({ page }) => {
		await signIn(page, ADMIN);
		await holdScripts(page);
		await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
		const button = page.getByRole('button', { name: 'Add User' });

		await expect(button).toHaveCSS('pointer-events', 'none');

		await expect(page.locator('html')).toHaveAttribute('data-hydrated', '');
		await button.click();
		await expect(page.getByRole('dialog')).toBeVisible();
	});
});
