import { expect, test, type Page } from '@playwright/test';
import Stripe from 'stripe';
import { ADMIN, APP_URL, FAKE_STRIPE_URL } from '../support/constants';
import { adminAuth, adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

// autopay in the browser and against the Firestore emulator: enrolling through (fake) Stripe setup,
// changing the amount, the daily job charging and the webhook recording it, a declined charge, a
// pending charge holding off a late fee, what the admin sees, and turning autopay off.
const AP = 'e2e-autopay-property';
const ANN = {
	uid: 'e2e-ann',
	email: 'ann@e2e.test',
	password: 'E2e-Ann-Passw0rd',
	firstName: 'Ann',
	lastName: 'Auto',
	stripeID: 'cus_ann'
};
const DEE = { uid: 'e2e-dee', email: 'dee@e2e.test', firstName: 'Dee', lastName: 'Klined' };
const PAT = { uid: 'e2e-pat', email: 'pat@e2e.test', firstName: 'Pat', lastName: 'Ending' };
const LEASE_ANN = 'e2e-autopay-ann';
const LEASE_DEE = 'e2e-autopay-dee';
const LEASE_PAT = 'e2e-autopay-pat';

/** Today in the business time zone, as the app counts days. */
const businessDay = (offsetDays = 0) =>
	new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Indiana/Indianapolis',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(Date.now() + offsetDays * 86_400_000));

type FakeInvoice = {
	id: string;
	status: string;
	customer: string;
	created: number;
	metadata: Record<string, string>;
	items: { description: string; amount: number }[];
};
const invoicesFor = async (leaseId: string) =>
	((await (await fetch(`${FAKE_STRIPE_URL}/__invoices`)).json()) as FakeInvoice[]).filter(
		(i) => i.metadata.leaseID === leaseId
	);
type SentEmail = { to: string | string[]; subject: string };
const emailsTo = async (email: string) =>
	((await (await fetch(`${FAKE_STRIPE_URL}/__emails`)).json()) as SentEmail[]).filter((m) =>
		[m.to].flat().includes(email)
	);
const payMode = (mode: 'succeed' | 'processing' | 'decline') =>
	fetch(`${FAKE_STRIPE_URL}/__pay/mode`, { method: 'POST', body: JSON.stringify({ mode }) });

/** Runs the daily job as the admin, from inside a signed-in page. */
async function runDailyJob(page: Page) {
	await signIn(page, ADMIN);
	return page.evaluate(async () => {
		const response = await fetch('/api/jobs/daily', { method: 'POST' });
		return { status: response.status, body: await response.json() };
	});
}

async function deliverWebhook(event: object) {
	const payload = JSON.stringify(event);
	const signature = new Stripe('sk_test_unused').webhooks.generateTestHeaderString({
		payload,
		secret: 'whsec_e2e'
	});
	return fetch(`${APP_URL}/api/stripe/webhook`, {
		method: 'POST',
		headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
		body: payload
	});
}

const lease = (
	id: string,
	tenant: string,
	startDate: string,
	extra: Record<string, unknown> = {}
) =>
	adminDb()
		.doc(`leases/${id}`)
		.set({
			propertyId: AP,
			tenantIds: [tenant],
			rent: 1000,
			startDate,
			endDate: null,
			document: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			...extra
		});

const autopayBlock = (page: Page) => page.locator('[data-autopay]');

test.describe.serial('autopay', () => {
	test.beforeAll(async () => {
		const db = adminDb();
		await db.doc(`properties/${AP}`).set({
			title: 'E2E Autopay House',
			description: 'Autopay test property',
			bedrooms: 2,
			bathrooms: 1,
			squareFeet: 900,
			rent: 1000,
			streetAddress: '5 Autopay Ln',
			apartmentInfo: '',
			city: 'Terre Haute',
			state: 'IN',
			zip: '47803'
		});
		await adminAuth()
			.createUser({ uid: ANN.uid, email: ANN.email, password: ANN.password })
			.catch(() => undefined);
		for (const person of [ANN, DEE, PAT]) {
			await db.doc(`users/${person.uid}`).set({
				email: person.email,
				firstName: person.firstName,
				lastName: person.lastName,
				phoneNumber: '+15555550170',
				permissions: 'user',
				stripeID: `cus_${person.uid}`
			});
		}
		// Ann's and Dee's rent is due today. No late fees on them.
		await lease(LEASE_ANN, ANN.uid, businessDay());
		await lease(LEASE_DEE, DEE.uid, businessDay(), { rent: 800 });
		// Pat's rent was due 10 days ago, past the 5-day grace period, but an autopay charge from
		// the due date is still settling (ACH), so the job must not add a late fee.
		await lease(LEASE_PAT, PAT.uid, businessDay(-10), {
			lateFee: 50,
			graceDays: 5,
			lateFeesFrom: businessDay(-10)
		});
		await db.doc(`leases/${LEASE_PAT}/autopay/${PAT.uid}`).set({
			paymentMethodId: 'pm_fake_bank',
			type: 'us_bank_account',
			brand: 'STRIPE TEST BANK',
			last4: '6789',
			amountCents: null,
			enrolledAt: new Date().toISOString()
		});
		await db.doc(`leases/${LEASE_PAT}/autopay_charges/${businessDay(-10)}_${PAT.uid}`).set({
			uid: PAT.uid,
			cycleKey: businessDay(-10),
			state: 'pending',
			attempts: 1,
			lastAttemptDay: businessDay(-10),
			claimedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
			// Enough to cover the first month and, if it has started, this one.
			amountCents: 200000,
			feeCents: 0,
			invoiceId: 'in_pending_ach'
		});
		await payMode('succeed');
	});

	test('Scenario: Start setup and Complete enrollment: the tenant saves a card for $500', async ({
		page
	}, testInfo) => {
		await signIn(page, ANN);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		await autopayBlock(page).getByLabel('Amount (optional)').fill('500');
		await autopayBlock(page).getByRole('button', { name: 'Set up autopay' }).click();

		// The (fake) Stripe setup page; saving returns to /payment with the session id.
		await expect(page.locator('#fake-setup')).toBeVisible();
		await page.locator('#fake-setup-save').click();

		await expect(autopayBlock(page)).toContainText('Autopay is on with your Visa ending 4242');
		await expect(autopayBlock(page)).toContainText('$500.00');
		await expect(page).toHaveURL(/\/payment$/);
		await page.screenshot({ path: testInfo.outputPath('autopay-on.png'), fullPage: true });

		const saved = (await adminDb().doc(`leases/${LEASE_ANN}/autopay/${ANN.uid}`).get()).data();
		expect(saved).toMatchObject({
			paymentMethodId: 'pm_fake_card',
			type: 'card',
			amountCents: 50000
		});
	});

	test('Scenario: Change amount: a blank amount is the full balance', async ({ page }) => {
		await signIn(page, ANN);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		await autopayBlock(page).getByRole('button', { name: 'Change amount' }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('spinbutton').fill('');
		await dialog.getByRole('button', { name: 'Submit' }).click();

		await expect(autopayBlock(page)).toContainText('Full balance');
	});

	test('Scenario: Charge on the due date: the job pays an invoice, the webhook records it, a re-run charges nothing', async ({
		page
	}) => {
		const result = await runDailyJob(page);
		expect(result.status).toBe(200);

		const [invoice, ...others] = await invoicesFor(LEASE_ANN);
		expect(others).toHaveLength(0);
		expect(invoice.status).toBe('paid');
		expect(invoice.customer).toBe(`cus_${ANN.uid}`);
		// The first month is prorated from today: rent times the days left over the days in the month.
		const [y, m, d] = businessDay().split('-').map(Number);
		const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
		const rentCents = Math.round((100000 * (days - d + 1)) / days);
		const feeCents = Math.round(rentCents * 0.03);
		expect(invoice.metadata).toMatchObject({
			autopay: 'true',
			uid: ANN.uid,
			rentCents: String(rentCents),
			feeCents: String(feeCents)
		});
		expect(invoice.items.map((i) => [i.description, i.amount])).toEqual([
			['Rent', rentCents],
			['Transaction Fee', feeCents]
		]);

		const event = {
			id: `evt_${invoice.id}`,
			object: 'event',
			type: 'invoice.payment_succeeded',
			created: Math.floor(Date.now() / 1000),
			data: { object: { ...invoice, object: 'invoice', lines: { data: [] } } }
		};
		expect((await deliverWebhook(event)).status).toBe(200);
		// Scenario: Webhook redelivery.
		expect((await deliverWebhook(event)).status).toBe(200);

		const year = businessDay().slice(0, 4);
		const history = (
			await adminDb().doc(`leases/${LEASE_ANN}/payment_history/${year}`).get()
		).data();
		const month = Object.values(history ?? {})[0] as { transactions: unknown[] };
		expect(month.transactions).toHaveLength(1);
		const charge = (
			await adminDb().doc(`leases/${LEASE_ANN}/autopay_charges/${businessDay()}_${ANN.uid}`).get()
		).data();
		expect(charge).toMatchObject({ state: 'succeeded', recordedAt: expect.any(String) });

		// Scenario: Re-run on the same day.
		expect((await runDailyJob(page)).status).toBe(200);
		expect(await invoicesFor(LEASE_ANN)).toHaveLength(1);
	});

	test('Scenario: Pending ACH: no late fee while the charge settles, and no second charge', async () => {
		const fees = await adminDb().collection(`leases/${LEASE_PAT}/late_fees`).get();
		expect(fees.empty).toBe(true);
		expect(await invoicesFor(LEASE_PAT)).toHaveLength(0);
	});

	test('Scenario: Card declined: the invoice is voided, the charge failed and the tenant emailed', async ({
		page
	}) => {
		await adminDb().doc(`leases/${LEASE_DEE}/autopay/${DEE.uid}`).set({
			paymentMethodId: 'pm_fake_card',
			type: 'card',
			brand: 'visa',
			last4: '0002',
			amountCents: null,
			enrolledAt: new Date().toISOString()
		});
		await payMode('decline');
		try {
			expect((await runDailyJob(page)).status).toBe(200);
		} finally {
			await payMode('succeed');
		}

		const [invoice] = await invoicesFor(LEASE_DEE);
		expect(invoice.status).toBe('void');
		const charge = (
			await adminDb().doc(`leases/${LEASE_DEE}/autopay_charges/${businessDay()}_${DEE.uid}`).get()
		).data();
		expect(charge).toMatchObject({
			state: 'failed',
			attempts: 1,
			error: 'Your card was declined.'
		});
		expect((await emailsTo(DEE.email)).map((m) => m.subject)).toContain(
			'Your autopay payment did not go through'
		);
	});

	test('Scenario: Lease list: the admin sees who has autopay on and a failed charge', async ({
		page
	}, testInfo) => {
		await signIn(page, ADMIN);
		await page.goto(`/admin/properties/${AP}/edit?tab=leases`);
		await page.waitForLoadState('networkidle');

		const leases = page.getByRole('list', { name: 'Leases' }).locator(':scope > li');
		await expect(leases.filter({ hasText: 'Ann Auto' })).toContainText(
			'Autopay: Ann Auto, Visa ending 4242, full balance'
		);
		const dee = leases.filter({ hasText: 'Dee Klined' });
		await expect(dee).toContainText('Autopay failed for Dee Klined');
		await expect(leases.filter({ hasText: 'Pat Ending' })).toContainText(
			'Autopay payment from Pat Ending processing'
		);
		// Scenario: Read-only.
		await expect(page.getByRole('button', { name: /autopay/i })).toHaveCount(0);
		await page.screenshot({ path: testInfo.outputPath('admin-autopay.png'), fullPage: true });
	});

	test('Scenario: Turn off: the tenant turns autopay off', async ({ page }) => {
		await signIn(page, ANN);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		await autopayBlock(page).getByRole('button', { name: 'Turn off autopay' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Turn off' }).click();

		await expect(autopayBlock(page).getByRole('button', { name: 'Set up autopay' })).toBeVisible();
		expect((await adminDb().doc(`leases/${LEASE_ANN}/autopay/${ANN.uid}`).get()).exists).toBe(
			false
		);
	});
});
