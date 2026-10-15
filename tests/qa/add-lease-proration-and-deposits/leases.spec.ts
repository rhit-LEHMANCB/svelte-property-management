import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
	newSession, createProperty, createLease, remember, entryText, leaseEntry, openLeases, editLease,
	shot, cleanup, fillLease, CHANGE
} from './helpers';

const CAP = 'leases';
const SHARED = path.resolve(process.cwd(), 'tests/qa', CHANGE, '.shared.json');
const fieldError = (page: Page, name: string) =>
	page.locator(`[name="${name}"]`).locator('xpath=ancestor::label').locator('.text-error-600-400');

let admin: Page;
let tenant: Page;
let prop = '';
const ids: Record<string, string> = {};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
	admin = await newSession(browser, 'admin');
	tenant = await newSession(browser, 'tenant');
	prop = await createProperty(admin, 'qa-billing-forms', 1200, 'forms QA Way');
	remember('property', prop);
});

test.afterAll(async () => {
	if (!admin) return;
	const left = await cleanup(admin, Object.values(ids), [prop]);
	console.log('leases cleanup, leases left:', left.length);
	await admin.context().close();
	await tenant.context().close();
});

test.describe('Admin lease list', () => {
	test('Property with no leases', async () => {
		await openLeases(admin, prop);
		await expect(admin.getByText('No leases', { exact: true })).toBeVisible();
		await expect(admin.getByRole('link', { name: 'New lease' }).first()).toBeVisible();
		await shot(admin, `${CAP}-property-with-no-leases`);
	});
});

test.describe('Create a lease', () => {
	test('Prefilled rent', async () => {
		await admin.goto(`/admin/properties/${prop}/leases/new`);
		await admin.waitForLoadState('networkidle');
		await expect(admin.locator('input[name="rent"]')).toHaveValue('1200');
		const lateFee = await admin.locator('input[name="lateFee"]').inputValue();
		expect(Number(lateFee)).toBe(60);
		test.info().annotations.push({ type: 'observed late fee text', description: lateFee });
		await expect(admin.locator('input[name="graceDays"]')).toHaveValue('5');
		await expect(admin.locator('input[name="deposit"]')).toHaveValue('');
		await shot(admin, `${CAP}-prefilled-rent`);
	});

	test('Rent changed before the late fee', async () => {
		await admin.goto(`/admin/properties/${prop}/leases/new`);
		await admin.waitForLoadState('networkidle');
		const rent = admin.locator('input[name="rent"]');
		await rent.fill('1300');
		expect(Number(await admin.locator('input[name="lateFee"]').inputValue())).toBe(65);
		await shot(admin, `${CAP}-rent-changed-before-the-late-fee`);
		// Once the late fee is edited by hand it stays put.
		await admin.locator('input[name="lateFee"]').fill('70');
		await rent.fill('1400');
		expect(Number(await admin.locator('input[name="lateFee"]').inputValue())).toBe(70);
	});

	test('Unknown property', async () => {
		const res = await admin.goto('/admin/properties/qa-does-not-exist/leases/new');
		expect(res?.status()).toBe(404);
		await shot(admin, `${CAP}-unknown-property`);
	});
});

test.describe('Lease record', () => {
	test('Valid lease', async () => {
		ids.v1 = await createLease(admin, prop, {
			rent: 1250, start: '2025-04-01', end: '2025-04-30', lateFee: '62.50', grace: 5
		});
		remember('lease', ids.v1, prop);
		await editLease(admin, prop, ids.v1);
		await expect(admin.locator('input[name="rent"]')).toHaveValue('1250');
		await expect(admin.locator('input[name="startDate"]')).toHaveValue('2025-04-01');
		expect(Number(await admin.locator('input[name="lateFee"]').inputValue())).toBe(62.5);
		await expect(admin.locator('input[name="graceDays"]')).toHaveValue('5');
		await expect(admin.locator('input[name="deposit"]')).toHaveValue('');
		await shot(admin, `${CAP}-valid-lease`);
	});

	test('Invalid fields', async () => {
		const cases: { field: string; lease: Parameters<typeof fillLease>[1] }[] = [
			{ field: 'rent', lease: { rent: 0, start: '2025-09-01', end: '2025-09-30' } },
			{ field: 'rent', lease: { rent: '10.123', start: '2025-09-01', end: '2025-09-30' } },
			{ field: 'startDate', lease: { rent: 900, start: '', end: '2025-09-30' } },
			{ field: 'endDate', lease: { rent: 900, start: '2025-09-30', end: '2025-09-30' } },
			{ field: 'endDate', lease: { rent: 900, start: '2025-09-30', end: '2025-09-01' } }
		];
		const seen: string[] = [];
		for (const [n, c] of cases.entries()) {
			await admin.goto(`/admin/properties/${prop}/leases/new`);
			await admin.waitForLoadState('networkidle');
			await fillLease(admin, c.lease);
			await admin.getByRole('button', { name: 'Save lease' }).click();
			await expect(fieldError(admin, c.field), `case ${n}`).toBeVisible();
			seen.push(`${c.field}: ${await fieldError(admin, c.field).innerText()}`);
			if (n === cases.length - 1) await shot(admin, `${CAP}-invalid-fields`);
		}
		test.info().annotations.push({ type: 'errors', description: seen.join(' | ') });
		await openLeases(admin, prop);
		await expect(leaseEntry(admin, '2025-09-30')).toHaveCount(0);
		await expect(leaseEntry(admin, '2025-09-01')).toHaveCount(0);
	});

	test('No tenants', async () => {
		await admin.goto(`/admin/properties/${prop}/leases/new`);
		await admin.waitForLoadState('networkidle');
		await fillLease(admin, { rent: 900, start: '2025-09-01', end: '2025-09-30', emails: [''] });
		await admin.getByRole('button', { name: 'Save lease' }).click();
		await expect(admin.getByText('A lease needs at least one tenant.')).toBeVisible();
		await shot(admin, `${CAP}-no-tenants`);
	});
});

test.describe('Edit a lease', () => {
	test('Remove the last tenant', async () => {
		await editLease(admin, prop, ids.v1);
		await admin.locator('input[name="emails"]').first().fill('');
		await admin.getByRole('button', { name: 'Save lease' }).click();
		await expect(admin.getByText('A lease needs at least one tenant.')).toBeVisible();
		await shot(admin, `${CAP}-remove-the-last-tenant`);
	});

	test('Add a tenant', async () => {
		test.skip(true, 'not verified: a new email creates a real account and sends a welcome email; the only other account, the QA admin, cannot be a tenant');
	});

	test('Remove a tenant', async () => {
		test.skip(true, 'not verified: needs a second tenant account, and the QA admin cannot be a tenant');
	});

	test('Change the rent', async () => {
		test.setTimeout(120_000);
		const shared = JSON.parse(fs.readFileSync(SHARED, 'utf8')) as { propC: string; t8: string };
		// State left by lease-billing: April 2026, $1,000.00 paid, start moved to 2026-04-15 (April = $533.33).
		await editLease(admin, shared.propC, shared.t8);
		await admin.locator('input[name="rent"]').fill('1200');
		await admin.getByRole('button', { name: 'Save lease' }).click();
		await admin.waitForURL(/tab=leases/);
		await openLeases(admin, shared.propC);
		// April = 1200 x 16/30 = 640.00; the $1,000.00 recorded stays, so credit is 360.00.
		let text = await entryText(admin, '2026-04-15');
		expect(text).toContain('Credit $360.00');
		expect(text).toContain('Owed $0.00');
		await shot(admin, `${CAP}-change-the-rent`);
		// Rent above what was paid: April = 3000 x 16/30 = 1,600.00, so $600.00 is owed and no credit is left.
		await editLease(admin, shared.propC, shared.t8);
		await admin.locator('input[name="rent"]').fill('3000');
		await admin.getByRole('button', { name: 'Save lease' }).click();
		await admin.waitForURL(/tab=leases/);
		await openLeases(admin, shared.propC);
		text = await entryText(admin, '2026-04-15');
		expect(text).toContain('$600.00');
		expect(text).not.toContain('Credit');
		await shot(admin, `${CAP}-change-the-rent-owed`);
		fs.writeFileSync(SHARED + '.rent', 'rent 3000 left on t8');
	});

	test('Change the dates', async () => {
		const shared = JSON.parse(fs.readFileSync(SHARED, 'utf8')) as { propC: string; t8: string };
		await openLeases(admin, shared.propC);
		// The start date was moved from 2026-04-01 to 2026-04-15: April is charged for 16 of 30 days
		// (3000 x 16/30 = 1,600.00) and is due on the new start date.
		const text = await entryText(admin, '2026-04-15');
		expect(text).toContain('$600.00 (due 2026-04-15)');
		await shot(admin, `${CAP}-change-the-dates`);
		// Put the rent back for tidiness.
		await editLease(admin, shared.propC, shared.t8);
		await admin.locator('input[name="rent"]').fill('1000');
		await admin.getByRole('button', { name: 'Save lease' }).click();
		await admin.waitForURL(/tab=leases/);
	});
});

test.describe('Delete a lease', () => {
	test('No payments', async () => {
		ids.d1 = await createLease(admin, prop, { rent: 800, start: '2025-06-01', end: '2025-06-30' });
		remember('lease', ids.d1, prop);
		await editLease(admin, prop, ids.d1);
		await admin.getByRole('button', { name: 'Delete lease' }).click();
		await admin.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
		await admin.waitForURL(/tab=leases/);
		await expect(leaseEntry(admin, '2025-06-01')).toHaveCount(0);
		await shot(admin, `${CAP}-no-payments`);
		delete ids.d1;
	});

	test('Has payments', async () => {
		const shared = JSON.parse(fs.readFileSync(SHARED, 'utf8')) as { propC: string; t8: string };
		await editLease(admin, shared.propC, shared.t8);
		await admin.getByRole('button', { name: 'Delete lease' }).click();
		await admin.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
		await expect(admin.getByText(/cannot be deleted|recorded payments/i).first()).toBeVisible();
		const res = await admin.request.delete(`/api/lease/${shared.t8}`);
		expect(res.status()).toBe(409);
		await openLeases(admin, shared.propC);
		await expect(leaseEntry(admin, '2026-04-15')).toBeVisible();
		await shot(admin, `${CAP}-has-payments`);
	});
});

test.describe('Admin lease list ordering', () => {
	test('Property with leases', async () => {
		// Two ended leases (no current lease can exist for the QA tenant): newest start first.
		const second = await createLease(admin, prop, { rent: 800, start: '2025-07-01', end: '2025-07-31' });
		remember('lease', second, prop);
		ids.second = second;
		await openLeases(admin, prop);
		const items = admin.locator('ul[aria-label="Leases"] > li');
		await expect(items).toHaveCount(2);
		expect(await items.nth(0).innerText()).toContain('2025-07-01');
		expect(await items.nth(1).innerText()).toContain('2025-04-01');
		await expect(items.nth(0)).toContainText(/ended/i);
		await shot(admin, `${CAP}-property-with-leases`);
	});

	test('Billing details', async () => {
		test.setTimeout(120_000);
		test.info().annotations.push({ type: 'partial', description: 'credit shown in the Change the rent test; deposit held in security-deposits; no late fee can be owed yet' });
		const shared = JSON.parse(fs.readFileSync(SHARED, 'utf8')) as { propC: string; t8: string };
		await editLease(admin, shared.propC, shared.t8);
		await admin.locator('input[name="rent"]').fill('1200');
		await admin.getByRole('button', { name: 'Save lease' }).click();
		await admin.waitForURL(/tab=leases/);
		await openLeases(admin, shared.propC);
		expect(await entryText(admin, '2026-04-15')).toContain('Credit $360.00');
		await shot(admin, `${CAP}-billing-details-credit`);
		test.skip(true, 'not verified: the late fee with a Waive action cannot be produced yet (see lease-billing); credit was confirmed, deposit held is in security-deposits');
	});
});

test.describe('Tenant lease card', () => {
	test('Month to month', async () => {
		// The QA tenant's own existing lease is month to month.
		await tenant.goto('/');
		await tenant.waitForLoadState('networkidle');
		await expect(tenant.getByText('month to month').first()).toBeVisible();
		await shot(tenant, `${CAP}-tenant-card-month-to-month`);
	});

	test('Deposit and late-fee terms', async () => {
		await tenant.goto('/');
		await tenant.waitForLoadState('networkidle');
		await expect(tenant.getByText(/if rent is not paid in full 5\s+days after it is due/).first()).toBeVisible();
		await shot(tenant, `${CAP}-tenant-card-deposit-and-late-fee-terms`);
		test.skip(true, 'not verified for the deposit half: the late fee text shows ($100.00, 5 days) but a current or upcoming lease with a deposit cannot be created for the QA tenant');
	});

	test('Current lease', async () => {
		test.skip(true, 'not verified: needs a current lease with a document for the QA tenant, which has only a pre-existing lease');
	});

	test('No lease', async () => {
		test.skip(true, 'not verified: the QA tenant has a lease');
	});
});
