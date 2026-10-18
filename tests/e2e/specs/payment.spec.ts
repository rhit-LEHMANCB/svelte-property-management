import { expect, test, type Page } from '@playwright/test';
import { ADMIN, FAKE_STRIPE_URL, LEASE_ID, PROPERTY, TENANT } from '../support/constants';
import { adminAuth, adminDb } from '../support/admin';
import { dollarsPattern, nextMonthPayable, signIn } from '../support/helpers';

type Recorded = { path: string; body: Record<string, string> };
const recorded = async () =>
	(await (await fetch(`${FAKE_STRIPE_URL}/__requests`)).json()) as Recorded[];

test.describe('rent-payments', () => {
	test.beforeEach(async () => {
		await fetch(`${FAKE_STRIPE_URL}/__requests`, { method: 'DELETE' });
	});

	test('Scenario: Valid amount sends the tenant to checkout with a Rent line and a transaction fee line', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Make a Payment' }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('spinbutton').fill('500');
		// Card is the default, and its fee for the amount is shown.
		await expect(dialog.getByText('Fee 3% ($15.00)')).toBeVisible();
		await expect(dialog.getByText('Total charged: $515.00')).toBeVisible();
		await dialog.getByRole('button', { name: 'Continue to payment' }).click();

		// The browser is sent to the (fake) hosted checkout page.
		await expect(page.locator('#fake-checkout')).toBeVisible();
		await expect(page).toHaveURL(/\/pay\/cs_fake_1$/);

		// What the app asked Stripe for.
		const requests = await recorded();
		expect(requests).toHaveLength(1);
		const body = requests[0].body;
		expect(body['customer']).toBe(TENANT.stripeID);
		expect(body['mode']).toBe('payment');
		expect(body['line_items[0][price_data][product_data][name]']).toBe('Rent');
		expect(body['line_items[0][price_data][unit_amount]']).toBe('50000');
		expect(body['line_items[1][price_data][product_data][name]']).toBe('Transaction Fee');
		// $500 * 3% = $15.00
		expect(body['line_items[1][price_data][unit_amount]']).toBe('1500');
		expect(body['invoice_creation[invoice_data][metadata][propertyID]']).toBe(PROPERTY.id);
		expect(body['invoice_creation[invoice_data][metadata][leaseID]']).toBe(LEASE_ID);
		expect(body['invoice_creation[invoice_data][metadata][paymentMethod]']).toBe('card');
		// Only cards (with Apple Pay and Google Pay); no bank account or Cash App Pay.
		expect(body['payment_method_types[0]']).toBe('card');
		expect(body['payment_method_types[1]']).toBeUndefined();
	});

	test('Scenario: Bank account: the tenant picks a bank account and pays a flat $5.00 fee', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Make a Payment' }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('spinbutton').fill('500');
		await dialog.getByRole('radio', { name: /Bank account/ }).check();
		await expect(dialog.getByText('Total charged: $505.00')).toBeVisible();
		await dialog.getByRole('button', { name: 'Continue to payment' }).click();

		await expect(page.locator('#fake-checkout')).toBeVisible();
		const [request] = await recorded();
		const body = request.body;
		expect(body['line_items[0][price_data][unit_amount]']).toBe('50000');
		expect(body['line_items[1][price_data][product_data][name]']).toBe('Transaction Fee');
		expect(body['line_items[1][price_data][unit_amount]']).toBe('500');
		expect(body['payment_method_types[0]']).toBe('us_bank_account');
		expect(body['payment_method_types[1]']).toBeUndefined();
		expect(body['invoice_creation[invoice_data][metadata][paymentMethod]']).toBe('bank');
		expect(body['invoice_creation[invoice_data][metadata][bankPaymentId]']).toMatch(/^\w+$/);
		expect(body['success_url']).toMatch(/\/payment\/success\?bank=\{CHECKOUT_SESSION_ID\}$/);
	});

	test('Scenario: Return from a bank payment: the confirmation says it takes a few business days and it shows as processing', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Make a Payment' }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('spinbutton').fill('250');
		await dialog.getByRole('radio', { name: /Bank account/ }).check();
		await dialog.getByRole('button', { name: 'Continue to payment' }).click();
		await expect(page.locator('#fake-checkout')).toBeVisible();
		const [request] = await recorded();
		const id = request.body['metadata[bankPaymentId]'];

		try {
			// Stripe sends the tenant back with the session id.
			await page.goto('/payment/success?bank=cs_fake_1');
			await expect(
				page.getByText('Bank payments take a few business days to complete.')
			).toBeVisible();

			await page.getByRole('link', { name: 'Back to payments' }).click();
			await expect(
				page.getByText(/A bank payment of \$250\.00 started on\s+\S+ is processing\./)
			).toBeVisible();
		} finally {
			await adminDb().doc(`leases/${LEASE_ID}/bank_payments/${id}`).delete();
		}
	});

	test('Scenario: Pending: a processing bank payment is shown and lowers what can be paid', async ({
		page
	}) => {
		const ref = adminDb().doc(`leases/${LEASE_ID}/bank_payments/e2ependingbank1`);
		await ref.set({
			uid: TENANT.uid,
			amountCents: 40000,
			feeCents: 500,
			state: 'pending',
			createdAt: '2026-10-16T15:00:00.000Z',
			startedAt: '2026-10-16T15:00:00.000Z',
			startedDay: '2026-10-16'
		});
		try {
			await signIn(page, TENANT);
			await page.goto('/payment');
			await page.waitForLoadState('networkidle');

			await expect(
				page.getByText('A bank payment of $400.00 started on 10/16/26 is processing.')
			).toBeVisible();
			await page.getByRole('button', { name: 'Make a Payment' }).click();
			const dialog = page.getByRole('dialog');
			const payable = (nextMonthPayable() ? 2000 : 1000) - 400;
			await expect(
				dialog.getByText(new RegExp(`pay up to ${dollarsPattern(payable)} now`))
			).toBeVisible();
			await dialog.getByRole('spinbutton').fill(String(payable + 1));
			await dialog.getByRole('button', { name: 'Continue to payment' }).click();
			await expect(dialog.getByRole('spinbutton')).toHaveAccessibleDescription(/no more than/);
			expect(await recorded()).toHaveLength(0);
		} finally {
			await ref.delete();
		}
	});

	test('Scenario: an amount above the balance is refused in the browser and nothing is sent to Stripe', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Make a Payment' }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('spinbutton').fill('999999');
		await dialog.getByRole('button', { name: 'Continue to payment' }).click();

		// Wait for the app to react (an error in the dialog) before checking that nothing was sent.
		const amount = dialog.getByRole('spinbutton');
		await expect(amount).toHaveAccessibleDescription(/no more than/);
		await expect(amount).toHaveAttribute('aria-invalid', 'true');
		await expect(page).toHaveURL(/\/payment$/);
		expect(await recorded()).toHaveLength(0);
	});

	test('Scenario: the page shows the real balance and the due date', async ({ page }) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		// One month of rent, two once next month is payable (from 7 days before the 1st).
		const owed = nextMonthPayable() ? 2000 : 1000;
		await expect(
			page.getByText(new RegExp(`You have a balance of ${dollarsPattern(owed)} due on`))
		).toBeVisible();
	});

	test('Scenario: the server refuses an amount above the balance and creates no session', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		const status = await page.evaluate(async (leaseId) => {
			const response = await fetch('/api/stripe/create-checkout-session/payment', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ amount: 1000.01, leaseId, method: 'card' })
			});
			return response.status;
		}, LEASE_ID);

		expect(status).toBe(400);
		expect(await recorded()).toHaveLength(0);
	});

	test("Scenario: Not the tenant's lease: paying against another lease is refused with 403", async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		const status = await page.evaluate(async () => {
			const response = await fetch('/api/stripe/create-checkout-session/payment', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ amount: 10, leaseId: 'someone-elses-lease', method: 'card' })
			});
			return response.status;
		});

		expect(status).toBe(403);
		expect(await recorded()).toHaveLength(0);
	});

	test('Scenario: the confirmation page opens for a tenant', async ({ page }) => {
		await signIn(page, TENANT);
		await page.goto('/payment/success');

		await expect(page.getByText('Thank you for your payment')).toBeVisible();
		await page.getByRole('link', { name: 'Back to payments' }).click();
		await expect(page).toHaveURL(/\/payment$/);
	});

	test('Scenario: an admin opening a tenant page is sent to /admin', async ({ page }) => {
		await signIn(page, ADMIN);

		for (const path of ['/payment', '/maintenance', '/insurance', '/payment/success']) {
			await page.goto(path);
			await expect(page).toHaveURL(/\/admin$/);
		}
	});
});

test.describe('rent-payments: request checks', () => {
	test.beforeEach(async () => {
		await fetch(`${FAKE_STRIPE_URL}/__requests`, { method: 'DELETE' });
	});

	const post = (page: Page, body: Record<string, unknown>) =>
		page.evaluate(async (payload) => {
			const response = await fetch('/api/stripe/create-checkout-session/payment', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			return response.status;
		}, body);

	test("Scenario: Not the tenant's lease: a missing leaseId is refused with 403", async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');

		expect(await post(page, { amount: 10, method: 'card' })).toBe(403);
		expect(await recorded()).toHaveLength(0);
	});

	test('Scenario: Invalid amount: a missing or non-numeric amount is refused with 400', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');

		expect(await post(page, { leaseId: LEASE_ID, method: 'card' })).toBe(400);
		expect(await post(page, { leaseId: LEASE_ID, amount: 'abc', method: 'card' })).toBe(400);
		expect(await recorded()).toHaveLength(0);
	});

	test('Scenario: Fractional cents: more than two decimals, zero or a negative amount is refused with 400', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');

		expect(await post(page, { leaseId: LEASE_ID, amount: 10.005, method: 'card' })).toBe(400);
		expect(await post(page, { leaseId: LEASE_ID, amount: 0, method: 'card' })).toBe(400);
		expect(await post(page, { leaseId: LEASE_ID, amount: -5, method: 'card' })).toBe(400);
		expect(await recorded()).toHaveLength(0);
	});

	test('Scenario: Missing or unknown method is refused with 400', async ({ page }) => {
		await signIn(page, TENANT);
		await page.goto('/payment');

		expect(await post(page, { leaseId: LEASE_ID, amount: 10 })).toBe(400);
		expect(await post(page, { leaseId: LEASE_ID, amount: 10, method: 'cashapp' })).toBe(400);
		expect(await recorded()).toHaveLength(0);
	});
});

/** The first (or last) day of this month, or `offset` months later, as YYYY-MM-DD, in local time. */
const monthDay = (offset: number, last = false) => {
	const now = new Date();
	const d = new Date(now.getFullYear(), now.getMonth() + offset + (last ? 1 : 0), last ? 0 : 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthName = (date: string) =>
	new Date(`${date}T12:00:00`).toLocaleString('en-US', { month: 'long' });

// A tenant with two leases: one that ended last month with its last two months unpaid, and a
// current one at another property. Each has its own balance.
test.describe.serial('rent-payments: one balance per lease', () => {
	const PAYER = {
		uid: 'e2e-payer',
		email: 'payer@e2e.test',
		password: 'E2e-Payer-Passw0rd'
	};
	const ENDED = 'e2e-payer-ended-lease';
	const CURRENT = 'e2e-payer-current-lease';
	const property = (title: string, streetAddress: string) => ({
		title,
		description: 'Payment test property',
		bedrooms: 1,
		bathrooms: 1,
		squareFeet: 600,
		rent: 1000,
		streetAddress,
		apartmentInfo: '',
		city: 'Terre Haute',
		state: 'IN',
		zip: '47803'
	});
	const lease = (propertyId: string, rent: number, startDate: string, endDate: string | null) => ({
		propertyId,
		tenantIds: [PAYER.uid],
		rent,
		startDate,
		endDate,
		document: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z'
	});
	const markPaid = (leaseId: string, date: string) =>
		adminDb()
			.doc(`leases/${leaseId}/payment_history/${date.slice(0, 4)}`)
			.set({ [monthName(date)]: { remainingBalance: 0 } }, { merge: true });

	test.beforeAll(async () => {
		const db = adminDb();
		await adminAuth()
			.deleteUser(PAYER.uid)
			.catch(() => undefined);
		await adminAuth().createUser({ uid: PAYER.uid, email: PAYER.email, password: PAYER.password });
		await db.doc(`users/${PAYER.uid}`).set({
			email: PAYER.email,
			firstName: 'Pat',
			lastName: 'Payer',
			phoneNumber: '+15555550170',
			permissions: 'user',
			stripeID: 'cus_payer'
		});
		await db.doc('properties/e2e-payer-old').set(property('E2E Old Place', '20 Old Rd'));
		await db.doc('properties/e2e-payer-new').set(property('E2E New Place', '22 New Rd'));
		await db
			.doc(`leases/${ENDED}`)
			.set(lease('e2e-payer-old', 1000, monthDay(-2), monthDay(-1, true)));
		await db.doc(`leases/${CURRENT}`).set(lease('e2e-payer-new', 500, monthDay(0), null));
	});

	test('Scenario: Ended lease: /payment lists the ended lease and the current lease, each with its balance', async ({
		page
	}) => {
		await signIn(page, PAYER);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		const ended = page.locator(`[data-lease="${ENDED}"]`);
		await expect(ended).toContainText('20 Old Rd, Terre Haute');
		await expect(ended).toContainText('ended');
		await expect(ended).toContainText('You have a balance of $2,000.00');
		const current = page.locator(`[data-lease="${CURRENT}"]`);
		await expect(current).toContainText('22 New Rd, Terre Haute');
		await expect(current).toContainText('current');
		await expect(current).toContainText(
			nextMonthPayable() ? 'You have a balance of $1,000.00' : 'You have a balance of $500.00'
		);
		await expect(
			page.getByRole('button', { name: 'Make a Payment for 20 Old Rd, Terre Haute' })
		).toBeEnabled();
	});

	test('Scenario: Paid in full: nothing to pay and no amount can be submitted', async ({
		page
	}) => {
		await markPaid(CURRENT, monthDay(0));
		if (nextMonthPayable()) await markPaid(CURRENT, monthDay(1));
		await markPaid(ENDED, monthDay(-2));
		await markPaid(ENDED, monthDay(-1));
		await signIn(page, PAYER);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		// The ended lease owes nothing, so it is no longer offered.
		await expect(page.locator(`[data-lease="${ENDED}"]`)).toHaveCount(0);
		const current = page.locator(`[data-lease="${CURRENT}"]`);
		await expect(current).toContainText('You have nothing to pay');
		await expect(current.getByRole('button', { name: 'Make a Payment' })).toBeDisabled();

		const status = await page.evaluate(async (leaseId) => {
			const response = await fetch('/api/stripe/create-checkout-session/payment', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ amount: 1, leaseId, method: 'card' })
			});
			return response.status;
		}, CURRENT);
		expect(status).toBe(400);
	});
});
