import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from '../support/constants';
import { adminAuth, adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

// lease-billing and security-deposits in the browser: the lease form's deposit and late-fee
// fields, the admin billing panel (waive, settle), and what the tenant sees. Tests run in order.
const BP = 'e2e-billing-property';
const BILL = {
	uid: 'e2e-bill',
	email: 'bill@e2e.test',
	password: 'E2e-Bill-Passw0rd',
	firstName: 'Bill',
	lastName: 'Payer'
};
const ENDED = 'e2e-billing-ended';

const leaseItems = (page: Page) =>
	page.getByRole('list', { name: 'Leases' }).locator(':scope > li');

test.describe.serial('lease billing', () => {
	// The lease the admin creates in the first test.
	let upcomingId = '';

	test.beforeAll(async () => {
		const db = adminDb();
		await db.doc(`properties/${BP}`).set({
			title: 'E2E Billing House',
			description: 'Billing test property',
			bedrooms: 2,
			bathrooms: 1,
			squareFeet: 900,
			rent: 1500,
			streetAddress: '3 Ledger Rd',
			apartmentInfo: '',
			city: 'Terre Haute',
			state: 'IN',
			zip: '47803'
		});
		await adminAuth()
			.createUser({ uid: BILL.uid, email: BILL.email, password: BILL.password })
			.catch(() => undefined);
		await db.doc(`users/${BILL.uid}`).set({
			email: BILL.email,
			firstName: BILL.firstName,
			lastName: BILL.lastName,
			phoneNumber: '+15555550160',
			permissions: 'user',
			stripeID: 'cus_bill'
		});
		// An ended lease: February 2025 was paid late (a $75 fee) and $500 over, the deposit is held.
		await db.doc(`leases/${ENDED}`).set({
			propertyId: BP,
			tenantIds: [BILL.uid],
			rent: 1000,
			startDate: '2025-01-01',
			endDate: '2025-02-28',
			document: null,
			deposit: { amount: 1000, dueDate: '2025-01-01' },
			lateFee: 75,
			graceDays: 5,
			lateFeesFrom: '2025-01-01'
		});
		await db.doc(`leases/${ENDED}/payment_history/2025`).set({
			January: { remainingBalance: 0, transactions: [{ amount: 1000, date: '2025-01-02' }] },
			February: { remainingBalance: -500, transactions: [{ amount: 1500, date: '2025-02-20' }] }
		});
		await db.doc(`leases/${ENDED}/deposit/ledger`).set({ paid: 1000, transactions: [] });
		// February's fee as the daily billing job charges it (the job itself is covered by the
		// handler tests; running it here would email every other e2e tenant).
		await db.doc(`leases/${ENDED}/late_fees/2025-02`).set({
			amount: 75,
			paid: 0,
			chargedAt: '2025-02-07T11:00:00.000Z',
			chargedBy: 'daily-job',
			dueDate: '2025-02-07'
		});
	});

	test('Scenario: Prefilled late fee follows the rent until edited, and the terms are saved', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await page.goto(`/admin/properties/${BP}/leases/new`);
		await page.waitForLoadState('networkidle');

		await expect(page.getByLabel('Late fee')).toHaveValue('75');
		await expect(page.getByLabel('Grace days')).toHaveValue('5');
		await page.getByLabel('Monthly rent').fill('1300');
		await expect(page.getByLabel('Late fee')).toHaveValue('65');

		await page.getByLabel('Start date', { exact: true }).fill('2099-01-15');
		await page.getByLabel('Security deposit').fill('1000');
		await page.getByLabel('Tenant email 1', { exact: true }).fill(BILL.email);
		await page.getByRole('button', { name: 'Save lease' }).click();
		await expect(page).toHaveURL(new RegExp(`/admin/properties/${BP}/edit\\?tab=leases`));

		const saved = (
			await adminDb().collection('leases').where('startDate', '==', '2099-01-15').get()
		).docs;
		expect(saved.map((d) => d.data())).toEqual([
			expect.objectContaining({
				propertyId: BP,
				rent: 1300,
				deposit: { amount: 1000, dueDate: '2099-01-15' },
				lateFee: 65,
				graceDays: 5
			})
		]);
		upcomingId = saved[0].id;
	});

	test('Scenario: Anyone else: a tenant cannot run the daily job', async ({ page }) => {
		await signIn(page, BILL);
		const status = await page.evaluate(
			async () => (await fetch('/api/jobs/daily', { method: 'POST' })).status
		);
		expect(status).toBe(401);
	});

	test('Scenario: Billing details on the Leases tab; waive a late fee', async ({
		page
	}, testInfo) => {
		await signIn(page, ADMIN);
		await page.goto(`/admin/properties/${BP}/edit?tab=leases`);
		await page.waitForLoadState('networkidle');

		const ended = leaseItems(page).filter({ hasText: '2025-01-01' });
		await expect(ended).toContainText('Deposit to settle');
		await expect(ended).toContainText('Credit');
		await expect(ended).toContainText('$500.00');
		await expect(ended).toContainText('Late fee February 2025: $75.00');
		await page.screenshot({ path: testInfo.outputPath('admin-leases-tab.png'), fullPage: true });

		await ended.getByRole('button', { name: 'Waive late fee for February 2025' }).click();
		await expect(ended).toContainText('Waived');
		await expect(ended.getByRole('button', { name: /Waive late fee/ })).toHaveCount(0);
	});

	test('Scenario: Settle a deposit: a mismatch is refused, then a matching settlement is saved', async ({
		page
	}, testInfo) => {
		await signIn(page, ADMIN);
		await page.goto(`/admin/properties/${BP}/edit?tab=leases`);
		await page.waitForLoadState('networkidle');
		const ended = leaseItems(page).filter({ hasText: '2025-01-01' });

		await ended.getByRole('button', { name: 'Settle deposit' }).click();
		await ended.getByLabel('Returned to the tenants').fill('700');
		await ended.getByRole('button', { name: 'Add deduction' }).click();
		await ended.getByLabel('Deduction 1 amount').fill('200');
		await ended.getByLabel('Deduction 1 reason').fill('Carpet cleaning');
		await ended.getByRole('button', { name: 'Save settlement' }).click();
		await expect(ended.getByRole('alert')).toContainText(
			'Returned and kept must add up to the deposit paid, $1,000.00.'
		);

		await ended.getByLabel('Returned to the tenants').fill('800');
		await ended.getByRole('button', { name: 'Save settlement' }).click();
		await expect(ended).toContainText('Settled');
		await expect(ended).toContainText('Returned $800.00; kept $200.00 for Carpet cleaning.');
		await page.screenshot({ path: testInfo.outputPath('admin-settled.png'), fullPage: true });
	});

	test('Scenario: Tenant sees deposit terms, the late fee, the past settlement and the deposit owed', async ({
		page
	}, testInfo) => {
		await signIn(page, BILL);
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		const card = page.getByRole('region', { name: 'Your lease' });
		await expect(card).toContainText('Security deposit');
		await expect(card).toContainText('$1,000.00, due January 15, 2099');
		await expect(card).toContainText('$65.00 if rent is not paid in full 5 days after it is due');
		const past = page.getByRole('region', { name: 'Past lease' });
		await expect(past).toContainText('Returned');
		await expect(past).toContainText('$200.00 for Carpet cleaning');
		await page.screenshot({ path: testInfo.outputPath('tenant-dashboard.png'), fullPage: true });

		await page.goto('/payment');
		await page.waitForLoadState('networkidle');
		// The upcoming lease owes its deposit; the ended one owes nothing after the waiver.
		const upcoming = page.locator(`[data-lease="${upcomingId}"]`);
		await expect(upcoming).toContainText('You have a balance of $1,000.00');
		await expect(upcoming).toContainText('Security deposit');
		await expect(page.locator(`[data-lease="${ENDED}"]`)).toHaveCount(0);
		await page.screenshot({ path: testInfo.outputPath('tenant-payment.png'), fullPage: true });
	});
});
