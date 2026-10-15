import { test, expect, type Page } from '@playwright/test';
import {
	newSession, createProperty, createLease, remember, entryText, leaseEntry, openLeases, editLease,
	shot, cleanup, startCheckout, payWithTestCard, waitFor, paymentBlock
} from './helpers';

const CAP = 'security-deposits';
// Each run creates its own property and T6 lease. A lease with payments cannot be deleted, so these
// 2021 windows (used by no earlier qa- lease) must be bumped for each new cycle.
const T6_START = '2021-10-01';
const T6_END = '2021-10-31';
const T6_LONG = 'October 1, 2021';
let admin: Page;
let tenant: Page;
let prop = '';
const ids: Record<string, string> = {};
const fieldError = (page: Page, name: string) =>
	page.locator(`[name="${name}"]`).locator('xpath=ancestor::label').locator('.text-error-600-400');
const save = (page: Page) => page.getByRole('button', { name: 'Save lease' }).click();
const entry = () => leaseEntry(admin, T6_START);

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.beforeAll(async ({ browser }) => {
	test.setTimeout(300_000);
	admin = await newSession(browser, 'admin');
	tenant = await newSession(browser, 'tenant');
	prop = await createProperty(admin, 'qa-billing-deposits', 1000, 'deposits QA Way');
	remember('property', prop);
	// Rent 1000, deposit 1000, due on the start date.
	ids.t6 = await createLease(admin, prop, { rent: 1000, start: T6_START, end: T6_END, deposit: 1000 });
	remember('lease', ids.t6, prop);
});

test.afterAll(async () => {
	if (!admin) return;
	const left = await cleanup(admin, Object.values(ids).filter((id) => id !== ids.t6), []);
	console.log('security-deposits cleanup, leases left:', left.length, '(t6 has payments)');
	await admin.context().close();
	await tenant.context().close();
});

test.describe('Deposit terms', () => {
	test('Deposit with default due date', async () => {
		ids.s1 = await createLease(admin, prop, { rent: 500, start: '2021-12-01', end: '2021-12-31', deposit: 1000 });
		remember('lease', ids.s1, prop);
		await editLease(admin, prop, ids.s1);
		await expect(admin.locator('input[name="deposit"]')).toHaveValue('1000');
		const due = await admin.locator('input[name="depositDueDate"]').inputValue();
		test.info().annotations.push({ type: 'observed deposit due field', description: due || '(empty)' });
		// The tenant's /payment page shows the due date used for the deposit: with rent due the same day it
		// cannot tell them apart, so the form value is the evidence.
		expect(['', '2021-12-01']).toContain(due);
		await shot(admin, `${CAP}-deposit-with-default-due-date`);
	});

	test('Chosen due date', async () => {
		ids.s2 = await createLease(admin, prop, { rent: 500, start: '2021-09-01', end: '2021-09-30', deposit: 800, depositDue: '2021-08-20' });
		remember('lease', ids.s2, prop);
		await editLease(admin, prop, ids.s2);
		await expect(admin.locator('input[name="depositDueDate"]')).toHaveValue('2021-08-20');
		await tenant.goto('/payment');
		await tenant.waitForLoadState('networkidle');
		// Deposit due 2021-08-20 is earlier than the September rent, so it is the lease's earliest due date.
		await expect(paymentBlock(tenant, ids.s2)).toContainText('due on 8/20/21');
		await paymentBlock(tenant, ids.s2).scrollIntoViewIfNeeded();
		await shot(tenant, `${CAP}-chosen-due-date`);
	});

	test('Invalid deposit', async () => {
		await editLease(admin, prop, ids.s1);
		await admin.locator('input[name="deposit"]').fill('-5');
		await save(admin);
		await expect(fieldError(admin, 'deposit')).toBeVisible();
		await admin.locator('input[name="deposit"]').fill('10.555');
		await save(admin);
		await expect(fieldError(admin, 'deposit')).toBeVisible();
		await shot(admin, `${CAP}-invalid-deposit`);
		// A deposit of 0 is its own case.
		await admin.locator('input[name="deposit"]').fill('0');
		await save(admin);
		const zeroError = await fieldError(admin, 'deposit').isVisible().catch(() => false);
		test.info().annotations.push({ type: 'deposit 0', description: zeroError ? 'error shown' : 'accepted or treated as no deposit' });
		expect(zeroError).toBe(true);
	});
});

test.describe('Deposit owed and paid', () => {
	test('Partial deposit', async () => {
		test.setTimeout(420_000);
		await startCheckout(tenant, ids.t6, 400);
		await payWithTestCard(tenant);
		const ok = await waitFor(admin, async () => {
			await openLeases(admin, prop);
			return (await entry().innerText()).includes('$400.00 paid');
		});
		test.skip(!ok, 'environment: the payment was not recorded (webhook not delivered to the dev site)');
		const t = await entryText(admin, T6_START);
		// Deposit 1000 owed, 400 paid and held, 600 still owed; rent untouched.
		expect(t).toContain('$400.00 paid');
		expect(t).toContain('$400.00 held');
		expect(t).toContain('Owed $1,600.00');
		await tenant.goto('/payment');
		await tenant.waitForLoadState('networkidle');
		await expect(paymentBlock(tenant, ids.t6).getByLabel('Balance breakdown')).toContainText('$600.00');
		await paymentBlock(tenant, ids.t6).scrollIntoViewIfNeeded();
		await shot(tenant, `${CAP}-partial-deposit`);
	});

	test('Deposit is not rent', async () => {
		await tenant.goto('/payment');
		await tenant.waitForLoadState('networkidle');
		const dl = paymentBlock(tenant, ids.t6).getByLabel('Balance breakdown');
		// Rent is still the full $1,000.00 after $400.00 went to the deposit.
		await expect(dl).toContainText('$1,000.00');
		await paymentBlock(tenant, ids.t6).scrollIntoViewIfNeeded();
		await shot(tenant, `${CAP}-deposit-is-not-rent`);
	});

	test('Upcoming lease', async () => {
		test.skip(true, 'not verified: the QA tenant cannot be given an upcoming lease');
	});
});

test.describe('Lowered below what is paid', () => {
	test('Lowered below what is paid', async () => {
		await editLease(admin, prop, ids.t6);
		await admin.locator('input[name="deposit"]').fill('300');
		await save(admin);
		const err = fieldError(admin, 'deposit');
		await expect(err).toBeVisible();
		await expect(err).toContainText(/cannot be less than the \$[\d,]+\.\d\d already paid/);
		await shot(admin, `${CAP}-lowered-below-what-is-paid`);
		await editLease(admin, prop, ids.t6);
		await expect(admin.locator('input[name="deposit"]')).toHaveValue('1000');
	});
});

test.describe('Deposit held', () => {
	test('Before settlement', async () => {
		await openLeases(admin, prop);
		expect(await entryText(admin, T6_START)).toContain('$400.00 held');
		await shot(admin, `${CAP}-before-settlement-admin`);
		await tenant.goto('/');
		await tenant.waitForLoadState('networkidle');
		const past = tenant.getByLabel('Past lease').filter({ hasText: T6_LONG });
		await expect(past).toContainText('Deposit paid');
		await expect(past).toContainText('$400.00');
		await expect(past).toContainText('not yet settled');
		await past.scrollIntoViewIfNeeded();
		await shot(tenant, `${CAP}-before-settlement-tenant`);
	});

	test('Ended lease still holding a deposit', async () => {
		await openLeases(admin, prop);
		await expect(entry().getByText('Deposit to settle')).toBeVisible();
		await shot(admin, `${CAP}-ended-lease-still-holding-a-deposit`);
	});
});

test.describe('Settle a deposit', () => {
	const open = async () => {
		await openLeases(admin, prop);
		await entry().getByRole('button', { name: /Settle deposit|Correct settlement/ }).click();
	};

	test('Does not add up', async () => {
		await open();
		const form = entry().locator('form');
		await form.getByRole('spinbutton').first().fill('300');
		await form.getByRole('button', { name: 'Add deduction' }).click();
		await form.getByPlaceholder('Amount').fill('50');
		await form.getByPlaceholder('Reason').fill('Carpet cleaning');
		await form.getByRole('button', { name: 'Save settlement' }).click();
		await expect(form).toContainText(/add up/i);
		await shot(admin, `${CAP}-does-not-add-up`);
	});

	test('Missing reason', async () => {
		await openLeases(admin, prop);
		await entry().getByRole('button', { name: 'Settle deposit' }).click();
		const form = entry().locator('form');
		await form.getByRole('spinbutton').first().fill('300');
		await form.getByRole('button', { name: 'Add deduction' }).click();
		await form.getByPlaceholder('Amount').fill('100');
		await form.getByRole('button', { name: 'Save settlement' }).click();
		await expect(form.locator('.text-error-600-400').first()).toBeVisible();
		await shot(admin, `${CAP}-missing-reason`);
	});

	test('Settled', async () => {
		await openLeases(admin, prop);
		await entry().getByRole('button', { name: 'Settle deposit' }).click();
		const form = entry().locator('form');
		await form.getByRole('spinbutton').first().fill('300');
		await form.getByRole('button', { name: 'Add deduction' }).click();
		await form.getByPlaceholder('Amount').fill('100');
		await form.getByPlaceholder('Reason').fill('Carpet cleaning');
		await form.getByRole('button', { name: 'Save settlement' }).click();
		await expect(entry().getByText('Settled', { exact: true })).toBeVisible();
		const t = await entryText(admin, T6_START);
		expect(t).toContain('Returned $300.00; kept $100.00 for Carpet cleaning');
		expect(t).not.toContain('Deposit to settle');
		await shot(admin, `${CAP}-settled`);
	});

	test('Correct a settlement', async () => {
		await openLeases(admin, prop);
		await entry().getByRole('button', { name: 'Correct settlement' }).click();
		const form = entry().locator('form');
		await form.getByRole('spinbutton').first().fill('350');
		await form.getByPlaceholder('Amount').fill('50');
		await form.getByRole('button', { name: 'Save settlement' }).click();
		await expect(entry()).toContainText('Returned $350.00; kept $50.00 for Carpet cleaning');
		expect(await entryText(admin, T6_START)).not.toContain('$300.00; kept $100.00');
		await shot(admin, `${CAP}-correct-a-settlement`);
	});

	test('Lease not ended', async () => {
		test.skip(true, 'not verified: no current or upcoming lease can be created for the QA tenant, and the existing one is not QA data');
	});

	test('Tenant tries to settle', async () => {
		const res = await tenant.request.put(`/api/lease/${ids.t6}/deposit/settlement`, { data: { returned: 400, deductions: [] } });
		expect(res.status()).toBe(401);
		await openLeases(admin, prop);
		await expect(entry()).toContainText('Returned $350.00; kept $50.00');
		await shot(admin, `${CAP}-tenant-tries-to-settle`);
	});

	test('Deposit paid after settlement', async () => {
		test.setTimeout(420_000);
		await startCheckout(tenant, ids.t6, 100);
		await payWithTestCard(tenant);
		const ok = await waitFor(admin, async () => {
			await openLeases(admin, prop);
			return (await entry().innerText()).includes('$500.00 paid');
		});
		test.skip(!ok, 'environment: the payment was not recorded (webhook not delivered to the dev site)');
		await expect(entry().getByText('Deposit to settle')).toBeVisible();
		await shot(admin, `${CAP}-deposit-paid-after-settlement`);
	});
});

test.describe('Tenant sees the deposit settlement', () => {
	test('Settled', async () => {
		// Record the correct settlement again for $500.00 paid (e.g. $450.00 returned, $50.00 kept).
		await openLeases(admin, prop);
		await entry().getByRole('button', { name: /Settle deposit|Correct settlement/ }).click();
		const form = entry().locator('form');
		await form.getByRole('spinbutton').first().fill('450');
		await form.getByRole('button', { name: 'Save settlement' }).click();
		await expect(entry().getByText('Settled', { exact: true })).toBeVisible();
		await tenant.goto('/');
		await tenant.waitForLoadState('networkidle');
		const past = tenant.getByLabel('Past lease').filter({ hasText: T6_LONG });
		await expect(past).toContainText('$500.00');
		await expect(past).toContainText('Returned');
		await expect(past).toContainText('$450.00');
		await expect(past).toContainText('Kept');
		await expect(past).toContainText('Carpet cleaning');
		await past.scrollIntoViewIfNeeded();
		await shot(tenant, `${CAP}-tenant-sees-settled`);
	});

	test('Another tenant\'s lease', async () => {
		test.skip(true, 'not verified: needs a second tenant account');
	});
});

test.describe('Delete a lease (leases capability)', () => {
	test('Has only a deposit payment', async () => {
		const res = await admin.request.delete(`/api/lease/${ids.t6}`);
		expect(res.status()).toBe(409);
		await editLease(admin, prop, ids.t6);
		await admin.getByRole('button', { name: 'Delete lease' }).click();
		await admin.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
		await expect(admin.getByText(/cannot be deleted|recorded payments/i).first()).toBeVisible();
		await shot(admin, `leases-has-only-a-deposit-payment`);
	});
});
