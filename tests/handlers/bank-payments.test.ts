import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { POST as startPayment } from '../../src/routes/api/stripe/create-checkout-session/payment/+server';
import { POST as webhook } from '../../src/routes/api/stripe/webhook/+server';
import { POST as runJob } from '../../src/routes/api/jobs/daily/+server';
import { load as paymentLoad } from '../../src/routes/(authenticated)/payment/+page.server';
import { load as successLoad } from '../../src/routes/(authenticated)/payment/success/+page.server';
import { call } from '../helpers/callHandler';
import { FakeTimestamp } from '../helpers/fakeFirestore';
import { VALID_STRIPE_SIGNATURE, services } from '../helpers/services';
import { db, seedAdmin, seedLease, seedProperty, seedTenant } from '../helpers/seed';

// pending-bank-payments: one-time bank (ACH) payments from Checkout until they settle or fail.

/** `day` at 6:00 in Indianapolis, when the daily job runs. */
const at = (day: string) => new Date(`${day}T11:00:00Z`);
const setNow = (day: string) => vi.setSystemTime(at(day));
const seconds = (day: string, hour = 15) => Math.floor(Date.parse(`${day}T${hour}:00:00Z`) / 1000);
const ts = (day: string) => new Date(`${day}T17:00:00Z`);

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	setNow('2026-11-03');
});
afterEach(() => vi.useRealTimers());

/** lease-1: t1 and t2, rent 1500 from 2026-10-01, late fee 75 after 5 days; October paid. */
function setup() {
	seedAdmin('admin-1');
	seedAdmin('admin-2');
	seedTenant('t1', { stripeID: 'cus_t1' });
	seedTenant('t2', { stripeID: 'cus_t2' });
	seedTenant('t3', { stripeID: 'cus_t3' });
	seedProperty('prop-1');
	seedLease('lease-1', {
		tenantIds: ['t1', 't2'],
		rent: 1500,
		startDate: '2026-10-01',
		lateFee: 75,
		graceDays: 5,
		lateFeesFrom: '2026-10-01'
	});
	db.seed('leases/lease-1/payment_history/2026', {
		October: { remainingBalance: 0, transactions: [{ amount: 1500, date: ts('2026-10-01') }] }
	});
}

const pay = (amount: number, method: unknown, userID = 't1', leaseId = 'lease-1') =>
	call(startPayment, { userID, body: { amount, leaseId, method } });

const send = (event: object) =>
	call(webhook, {
		rawBody: JSON.stringify(event),
		headers: { 'stripe-signature': VALID_STRIPE_SIGNATURE }
	});

const runDaily = () =>
	call(runJob, {
		userID: null,
		method: 'POST',
		headers: { authorization: 'Bearer jobs-secret-fixture' },
		body: {}
	});

type Record_ = Record<string, unknown>;
const bankPayments = async () =>
	(await db.collection('leases').doc('lease-1').collection('bank_payments').get()).docs;

/** Starts a bank Checkout for `amount` and returns the session params and the record's id. */
async function startBank(amount = 500, userID = 't1') {
	const result = await pay(amount, 'bank', userID);
	expect(result.status).toBe(200);
	const params = services.stripe.checkout.sessions.create.mock.calls.at(-1)![0];
	return { params, id: params.metadata.bankPaymentId as string };
}

const session = (id: string, extra: Record_ = {}) => ({
	id: 'cs_test_1',
	object: 'checkout.session',
	customer: 'cus_t1',
	status: 'complete',
	payment_status: 'unpaid',
	payment_intent: 'pi_bank_1',
	metadata: { leaseID: 'lease-1', paymentMethod: 'bank', bankPaymentId: id },
	...extra
});
const sessionEvent = (type: string, id: string, day: string, extra: Record_ = {}) => ({
	type,
	created: seconds(day),
	data: { object: session(id, extra) }
});
const invoicePaid = (id: string, params: Record_, day: string) => ({
	type: 'invoice.payment_succeeded',
	created: seconds(day),
	data: {
		object: {
			id: `in_bank_${id}`,
			created: seconds(day),
			customer: 'cus_t1',
			metadata: (params as { invoice_creation: { invoice_data: { metadata: Record_ } } })
				.invoice_creation.invoice_data.metadata,
			lines: { data: [] }
		}
	}
});

describe('pending-bank-payments: starting a bank payment', () => {
	it('Scenario: Bank account: a $5.00 fee, bank only, a started record and a bank success URL', async () => {
		setup();

		const { params, id } = await startBank(964.52);

		expect(params.payment_method_types).toEqual(['us_bank_account']);
		const fee = params.line_items.at(-1);
		expect(fee.price_data.product_data.name).toBe('Transaction Fee');
		expect(fee.price_data.product_data.description).toBe(
			'Transaction fee for one-time bank payment.'
		);
		expect(fee.price_data.unit_amount).toBe(500);
		expect(params.invoice_creation.invoice_data.metadata).toMatchObject({
			leaseID: 'lease-1',
			feeCents: '500',
			paymentMethod: 'bank',
			bankPaymentId: id
		});
		expect(params.metadata).toMatchObject({ leaseID: 'lease-1', bankPaymentId: id });
		expect(params.payment_intent_data.metadata).toMatchObject({ bankPaymentId: id });
		expect(params.success_url).toBe(
			`${PUBLIC_FRONTEND_URL}/payment/success?bank={CHECKOUT_SESSION_ID}`
		);
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({
			uid: 't1',
			amountCents: 96452,
			feeCents: 500,
			state: 'started',
			startedDay: null
		});
	});

	it('Scenario: Card: card only (wallets included), the card fee and no record', async () => {
		setup();

		await pay(964.52, 'card');

		const params = services.stripe.checkout.sessions.create.mock.calls[0][0];
		expect(params.payment_method_types).toEqual(['card']);
		expect(params.line_items.at(-1).price_data.unit_amount).toBe(2827);
		expect(params.metadata.bankPaymentId).toBeUndefined();
		expect(await bankPayments()).toHaveLength(0);
	});

	it('a session Stripe refuses to create leaves no record behind', async () => {
		setup();
		services.stripe.checkout.sessions.create.mockRejectedValue(new Error('Stripe is down'));

		await expect(pay(500, 'bank')).rejects.toThrow('Stripe is down');
		expect(await bankPayments()).toHaveLength(0);
	});

	it('Scenario: Missing or unknown method responds 400 and creates no session', async () => {
		setup();

		for (const method of [undefined, '', 'cashapp', 'us_bank_account']) {
			expect((await pay(100, method)).status).toBe(400);
		}
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('Scenario: Payable amount reduced: pending bank payments and autopay in flight lower the cap', async () => {
		setup();
		setNow('2026-11-02');
		db.seed('leases/lease-1/bank_payments/pendingbank01', {
			uid: 't2',
			amountCents: 100000,
			feeCents: 500,
			state: 'pending',
			createdAt: '2026-11-01T15:00:00.000Z',
			startedDay: '2026-11-01'
		});
		db.seed('leases/lease-1/autopay_charges/2026-11-01_t1', {
			uid: 't1',
			cycleKey: '2026-11-01',
			state: 'pending',
			amountCents: 20000,
			attempts: 1,
			lastAttemptDay: '2026-11-01',
			claimedAt: '2026-11-01T11:00:00.000Z',
			feeCents: 0
		});

		// $1,500 owed - $1,000 bank - $200 autopay = $300 payable.
		expect((await pay(300.01, 'card', 't1')).status).toBe(400);
		expect((await pay(300, 'card', 't1')).status).toBe(200);
		// A started (never completed) or failed record holds nothing off.
		await db
			.doc('leases/lease-1/bank_payments/pendingbank01')
			.set({ state: 'failed' }, { merge: true });
		expect((await pay(1300, 'bank', 't2')).status).toBe(200);
	});
});

describe('pending-bank-payments: completing Checkout', () => {
	it('Scenario: Checkout completed, not settled: the record becomes pending with the start day', async () => {
		setup();
		const { id } = await startBank();

		const result = await send(sessionEvent('checkout.session.completed', id, '2026-11-04'));

		expect(result.status).toBe(200);
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({
			state: 'pending',
			startedDay: '2026-11-04',
			startedAt: '2026-11-04T15:00:00.000Z',
			paymentIntentId: 'pi_bank_1'
		});
	});

	it('Scenario: Settled at once: a paid session keeps the day but is not pending', async () => {
		setup();
		const { id } = await startBank();

		await send(
			sessionEvent('checkout.session.completed', id, '2026-11-04', { payment_status: 'paid' })
		);

		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({
			state: 'started',
			startedDay: '2026-11-04'
		});
	});

	it('a card session or one without a record is ignored', async () => {
		setup();
		const event = sessionEvent('checkout.session.completed', 'nosuchpayment1', '2026-11-04');
		expect((await send(event)).status).toBe(200);
		const card = {
			...event,
			data: { object: { ...event.data.object, metadata: { leaseID: 'lease-1' } } }
		};
		expect((await send(card)).status).toBe(200);
		expect(await bankPayments()).toHaveLength(0);
	});

	it('Scenario: Returned before the event: the success page makes it pending, and the event changes nothing', async () => {
		setup();
		const { id } = await startBank();
		services.stripe.checkout.sessions.retrieve.mockResolvedValue(session(id));

		const data = await call(successLoad, {
			userID: 't1',
			url: `${PUBLIC_FRONTEND_URL}/payment/success?bank=cs_test_1`
		});

		expect(data).toMatchObject({ status: 200, data: { bank: true } });
		expect(services.stripe.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_test_1');
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({
			state: 'pending',
			startedDay: '2026-11-03'
		});

		await send(sessionEvent('checkout.session.completed', id, '2026-11-04'));
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({
			state: 'pending',
			startedDay: '2026-11-03'
		});
		expect(await bankPayments()).toHaveLength(1);
	});

	it("Scenario: Not the tenant's session: someone else's or a non-bank session changes nothing", async () => {
		setup();
		const { id } = await startBank();

		// Another customer's session.
		services.stripe.checkout.sessions.retrieve.mockResolvedValue(
			session(id, { customer: 'cus_t3' })
		);
		const other = await call(successLoad, {
			userID: 't3',
			url: `${PUBLIC_FRONTEND_URL}/payment/success?bank=cs_test_1`
		});
		expect(other.data).toEqual({ bank: false });

		// t2 is on the lease, but the session and the record are t1's.
		services.stripe.checkout.sessions.retrieve.mockResolvedValue(
			session(id, { customer: 'cus_t2' })
		);
		const coTenant = await call(successLoad, {
			userID: 't2',
			url: `${PUBLIC_FRONTEND_URL}/payment/success?bank=cs_test_1`
		});
		expect(coTenant.data).toEqual({ bank: false });

		// A card session (no bank payment id), and a malformed id that never reaches Stripe.
		services.stripe.checkout.sessions.retrieve.mockResolvedValue(
			session(id, { metadata: { leaseID: 'lease-1' } })
		);
		const card = await call(successLoad, {
			userID: 't1',
			url: `${PUBLIC_FRONTEND_URL}/payment/success?bank=cs_test_1`
		});
		expect(card.data).toEqual({ bank: false });
		services.stripe.checkout.sessions.retrieve.mockClear();
		const bad = await call(successLoad, {
			userID: 't1',
			url: `${PUBLIC_FRONTEND_URL}/payment/success?bank=../users/t1`
		});
		expect(bad.data).toEqual({ bank: false });
		expect(services.stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();

		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({ state: 'started' });
	});

	it('the plain success page (a card payment) is not a bank payment', async () => {
		setup();
		const data = await call(successLoad, {
			userID: 't1',
			url: `${PUBLIC_FRONTEND_URL}/payment/success`
		});
		expect(data.data).toEqual({ bank: false });
	});
});

describe('pending-bank-payments: settling, late fees and autopay', () => {
	it('Scenario: Settles after the grace period: dated by its start day, marked succeeded, no late fee', async () => {
		setup();
		setNow('2026-11-04');
		const { params, id } = await startBank(1500);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-04'));

		// The grace period ends on the 6th; the run on the 7th charges nothing while it is pending.
		setNow('2026-11-07');
		expect((await runDaily()).status).toBe(200);
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toBeUndefined();

		// It settles on the 9th, and is recorded as paid on the 4th.
		setNow('2026-11-09');
		expect((await send(invoicePaid(id, params, '2026-11-09'))).status).toBe(200);
		const november = (
			db.peek('leases/lease-1/payment_history/2026') as Record<
				string,
				{ remainingBalance: number; transactions: { date: FakeTimestamp; amount: number }[] }
			>
		).November;
		expect(november.remainingBalance).toBe(0);
		expect(november.transactions).toHaveLength(1);
		expect(november.transactions[0].date.toDate().toISOString()).toBe('2026-11-04T15:00:00.000Z');
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({
			state: 'succeeded',
			invoiceId: `in_bank_${id}`
		});

		setNow('2026-11-10');
		await runDaily();
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toBeUndefined();
	});

	it('without a start time (no completion event, no success page) the payment is dated when Checkout began', async () => {
		setup();
		setNow('2026-11-04');
		const { params, id } = await startBank(1500);

		setNow('2026-11-09');
		await send(invoicePaid(id, params, '2026-11-09'));

		const november = (
			db.peek('leases/lease-1/payment_history/2026') as Record<
				string,
				{ transactions: { date: FakeTimestamp }[] }
			>
		).November;
		expect(november.transactions[0].date.toDate().toISOString()).toBe('2026-11-04T11:00:00.000Z');
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({ state: 'succeeded' });
	});

	it('Scenario: Recorded once: a redelivered invoice or success event records nothing again', async () => {
		setup();
		const { params, id } = await startBank(500);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-03'));
		await send(invoicePaid(id, params, '2026-11-05'));
		await send(invoicePaid(id, params, '2026-11-05'));
		await send(sessionEvent('checkout.session.async_payment_succeeded', id, '2026-11-05'));

		const november = (
			db.peek('leases/lease-1/payment_history/2026') as Record<string, { transactions: unknown[] }>
		).November;
		expect(november.transactions).toHaveLength(1);
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({ state: 'succeeded' });
	});

	it('async_payment_succeeded alone leaves the payment pending until the invoice is recorded', async () => {
		setup();
		const { id } = await startBank(500);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-03'));
		await send(sessionEvent('checkout.session.async_payment_succeeded', id, '2026-11-05'));
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({ state: 'pending' });
	});

	it('Scenario: Pending payment fails: late fees resume from the next run', async () => {
		setup();
		setNow('2026-11-04');
		const { id } = await startBank(1500);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-04'));
		setNow('2026-11-07');
		await runDaily();
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toBeUndefined();

		await send(sessionEvent('checkout.session.async_payment_failed', id, '2026-11-07'));
		setNow('2026-11-08');
		await runDaily();
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toMatchObject({ amount: 75 });
	});

	it('Scenario: Due date while a bank payment is pending: autopay charges only the rest', async () => {
		setup();
		setNow('2026-10-31');
		db.seed('leases/lease-1/autopay/t1', {
			paymentMethodId: 'pm_card',
			type: 'card',
			brand: 'visa',
			last4: '4242',
			amountCents: null,
			enrolledAt: '2026-10-01T00:00:00.000Z'
		});
		db.seed('leases/lease-1/bank_payments/pendingbank02', {
			uid: 't2',
			amountCents: 60000,
			feeCents: 500,
			state: 'pending',
			createdAt: '2026-10-31T15:00:00.000Z',
			startedDay: '2026-10-31'
		});

		setNow('2026-11-01');
		await runDaily();

		const items = services.stripe.invoiceItems.create.mock.calls.map(([item]) => item);
		const charged = items
			.filter((item) => item.description !== 'Transaction Fee')
			.reduce((sum, item) => sum + (item.amount as number), 0);
		// $1,500 owed - $600 on its way.
		expect(charged).toBe(90000);
	});
});

describe('pending-bank-payments: autopay notices', () => {
	it('Scenario: Due date while a bank payment is pending: the autopay notice quotes only the rest', async () => {
		setup();
		db.seed('leases/lease-1/autopay/t1', {
			paymentMethodId: 'pm_bank',
			type: 'us_bank_account',
			brand: 'Test Bank',
			last4: '6789',
			amountCents: null,
			enrolledAt: '2026-10-01T00:00:00.000Z'
		});
		db.seed('leases/lease-1/bank_payments/pendingbank03', {
			uid: 't2',
			amountCents: 60000,
			feeCents: 500,
			state: 'pending',
			createdAt: '2026-10-24T15:00:00.000Z',
			startedDay: '2026-10-24'
		});

		// Seven days before November rent is due.
		setNow('2026-10-25');
		expect((await runDaily()).status).toBe(200);

		const notice = services.sendEmail.mock.calls
			.map(([m]) => m)
			.find((m) => m.to === 't1@example.com');
		// $1,500 owed - $600 on its way; a bank account has no fee.
		expect(notice?.subject).toBe('Autopay will charge $900.00 on November 1, 2026');
	});
});

describe('pending-bank-payments: failures', () => {
	it('Scenario: Payment fails: marked failed with the reason; the tenant and every admin are emailed once', async () => {
		setup();
		const { id } = await startBank(964.52);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-03'));
		services.stripe.paymentIntents.retrieve.mockResolvedValue({
			id: 'pi_bank_1',
			status: 'requires_payment_method',
			last_payment_error: { message: 'Insufficient funds' }
		});

		expect(
			(await send(sessionEvent('checkout.session.async_payment_failed', id, '2026-11-06'))).status
		).toBe(200);
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({
			state: 'failed',
			failedDay: '2026-11-06',
			error: 'Insufficient funds'
		});
		const sent = services.sendEmail.mock.calls.map(([m]) => m);
		expect(sent.map((m) => m.to).sort()).toEqual([
			'admin-1@example.com',
			'admin-2@example.com',
			't1@example.com'
		]);
		const tenant = sent.find((m) => m.to === 't1@example.com')!;
		expect(tenant.subject).toBe('Your bank payment did not go through');
		expect(tenant.text).toContain('$964.52');
		expect(tenant.text).toContain('November 3, 2026');
		expect(tenant.text).toContain('Insufficient funds');
		expect(tenant.text).toContain(`${PUBLIC_FRONTEND_URL}/payment`);
		expect(tenant.text).toContain('Lehman Family LLC');
		const admin = sent.find((m) => m.to === 'admin-1@example.com')!;
		expect(admin.subject).toBe('Bank payment failed: 1 Main St, Terre Haute');
		expect(admin.text).toContain('Tom Tenant');
		expect(admin.text).toContain('/admin/properties/prop-1/leases/lease-1');

		// Redelivered: nothing changes and nobody is emailed again.
		await send(sessionEvent('checkout.session.async_payment_failed', id, '2026-11-06'));
		expect(services.sendEmail).toHaveBeenCalledTimes(3);
		// The failure no longer lowers what can be paid.
		expect((await pay(1500, 'card', 't2')).status).toBe(200);
	});

	it('a bank invoice reaching invoice.payment_failed is handled the same way', async () => {
		setup();
		const { params, id } = await startBank(500);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-03'));
		const event = invoicePaid(id, params, '2026-11-06');
		await send({
			...event,
			type: 'invoice.payment_failed',
			data: { object: { ...event.data.object, payment_intent: 'pi_bank_1' } }
		});
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({
			state: 'failed',
			error: 'The bank payment did not go through'
		});
	});

	it('Scenario: Late events: a failure after success, or completion after failure, changes nothing', async () => {
		setup();
		const { params, id } = await startBank(500);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-03'));
		await send(invoicePaid(id, params, '2026-11-05'));
		await send(sessionEvent('checkout.session.async_payment_failed', id, '2026-11-06'));
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({ state: 'succeeded' });
		expect(services.sendEmail).not.toHaveBeenCalled();

		const second = await startBank(200);
		await send(sessionEvent('checkout.session.async_payment_failed', second.id, '2026-11-04'));
		await send(sessionEvent('checkout.session.completed', second.id, '2026-11-04'));
		expect(db.peek(`leases/lease-1/bank_payments/${second.id}`)).toMatchObject({
			state: 'failed'
		});
	});

	it('Scenario: Email cannot be sent: the daily job retries it, and each group gets it once', async () => {
		setup();
		const { id } = await startBank(500);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-03'));
		services.sendEmail.mockImplementation(async ({ to }: { to: string }) => {
			if (to === 't1@example.com') throw new Error('provider down');
		});
		expect(
			(await send(sessionEvent('checkout.session.async_payment_failed', id, '2026-11-04'))).status
		).toBe(200);
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({
			adminsEmailedAt: expect.any(String)
		});
		expect((db.peek(`leases/lease-1/bank_payments/${id}`) as Record_).tenantEmailedAt).toBeFalsy();

		services.sendEmail.mockReset().mockResolvedValue(undefined);
		setNow('2026-11-05');
		const result = await runDaily();
		expect(result.status).toBe(200);
		expect(services.sendEmail.mock.calls.map(([m]) => m.to)).toEqual(['t1@example.com']);
		setNow('2026-11-06');
		await runDaily();
		expect(services.sendEmail.mock.calls.map(([m]) => m.to)).toEqual(['t1@example.com']);
	});

	it('a payment Stripe says succeeded but that was never recorded is reported, not dropped', async () => {
		setup();
		const { id } = await startBank(500);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-03'));
		services.stripe.paymentIntents.retrieve.mockResolvedValue({
			id: 'pi_bank_1',
			status: 'succeeded'
		});

		setNow('2026-11-10');
		const result = await runDaily();

		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({ state: 'pending' });
		const runs = db.peek('_jobs/daily/runs/2026-11-10') as { runs: { warnings: string[] }[] };
		expect(runs.runs.at(-1)!.warnings).toContain(
			`lease lease-1: bank payment ${id} succeeded at Stripe but is not recorded yet`
		);
		expect(result.status).toBe(200);
	});

	it('Scenario: Lost event: a payment pending more than 7 days is checked with Stripe', async () => {
		setup();
		const { id } = await startBank(500);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-03'));
		services.stripe.paymentIntents.retrieve.mockResolvedValue({
			id: 'pi_bank_1',
			status: 'processing'
		});

		// Not checked before 7 days; still processing on day 7, so it stays pending.
		setNow('2026-11-09');
		await runDaily();
		expect(services.stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
		setNow('2026-11-10');
		await runDaily();
		expect(services.stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_bank_1');
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({ state: 'pending' });

		services.stripe.paymentIntents.retrieve.mockResolvedValue({
			id: 'pi_bank_1',
			status: 'canceled',
			last_payment_error: null
		});
		setNow('2026-11-11');
		await runDaily();
		expect(db.peek(`leases/lease-1/bank_payments/${id}`)).toMatchObject({
			state: 'failed',
			failedDay: '2026-11-11'
		});
		expect(services.sendEmail.mock.calls.map(([m]) => m.subject)).toContain(
			'Your bank payment did not go through'
		);
	});
});

describe('pending-bank-payments: /payment', () => {
	const parent = () => ({
		userLeases: [
			{
				id: 'lease-1',
				propertyId: 'prop-1',
				address: '1 Main St, Terre Haute',
				rent: 1500,
				startDate: '2026-10-01',
				endDate: null,
				status: 'current',
				otherTenants: [],
				hasDocument: false
			}
		]
	});
	const load = async (uid: string) =>
		(await call(paymentLoad, { userID: uid, parent: parent() })).data as {
			leases: {
				balanceCents: number;
				payableCents: number;
				bankPayments: {
					pending: { amountCents: number; day: string }[];
					failed: { amountCents: number; day: string } | null;
				};
			}[];
		};

	it('Scenario: Pending: every tenant sees it; the balance stays, the payable amount drops', async () => {
		setup();
		const { id } = await startBank(964.52);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-03'));

		for (const uid of ['t1', 't2']) {
			const [lease] = (await load(uid)).leases;
			expect(lease.balanceCents).toBe(150000);
			expect(lease.payableCents).toBe(150000 - 96452);
			expect(lease.bankPayments.pending).toEqual([{ amountCents: 96452, day: '2026-11-03' }]);
			// Never who paid or why.
			expect(JSON.stringify(lease.bankPayments)).not.toContain('t1');
		}
	});

	it('Scenario: Failure note: only the paying tenant, for 7 days', async () => {
		setup();
		const { id } = await startBank(500);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-03'));
		await send(sessionEvent('checkout.session.async_payment_failed', id, '2026-11-04'));

		expect((await load('t1')).leases[0].bankPayments.failed).toEqual({
			amountCents: 50000,
			day: '2026-11-03'
		});
		expect((await load('t2')).leases[0].bankPayments.failed).toBeNull();
		expect((await load('t1')).leases[0].payableCents).toBe(150000);

		setNow('2026-11-12');
		expect((await load('t1')).leases[0].bankPayments.failed).toBeNull();
	});

	it('Scenario: Everything on its way: nothing is payable', async () => {
		setup();
		const { id } = await startBank(1500);
		await send(sessionEvent('checkout.session.completed', id, '2026-11-03'));

		const [lease] = (await load('t2')).leases;
		expect(lease.balanceCents).toBe(150000);
		expect(lease.payableCents).toBe(0);
		expect((await pay(1, 'card', 't2')).status).toBe(400);
	});
});
