import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as runJob } from '../../src/routes/api/jobs/daily/+server';
import { POST as webhook } from '../../src/routes/api/stripe/webhook/+server';
import { call } from '../helpers/callHandler';
import { VALID_STRIPE_SIGNATURE, services } from '../helpers/services';
import { db, seedLease, seedProperty, seedTenant } from '../helpers/seed';

// autopay: the daily job charges enrolled tenants; the webhook records and settles the charges.

type HistoryMonth = { transactions: { amount: number; fee?: number }[] };

/** `day` at 6:00 in Indianapolis. */
const at = (day: string) => new Date(`${day}T11:00:00Z`);
const SECRET = { authorization: 'Bearer jobs-secret-fixture' };
const run = () => call(runJob, { method: 'POST', headers: SECRET, body: {} });
const runOn = async (day: string) => {
	vi.setSystemTime(at(day));
	return run();
};

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

/** lease-1: t1 and t2, rent 1000 from 2026-11-01, late fee 50 after 5 days. Nothing paid. */
function setup(terms: Record<string, unknown> = {}) {
	seedTenant('t1');
	seedTenant('t2');
	seedProperty('prop-1');
	seedLease('lease-1', {
		tenantIds: ['t1', 't2'],
		rent: 1000,
		startDate: '2026-11-01',
		lateFee: 50,
		graceDays: 5,
		lateFeesFrom: '2026-01-01',
		...terms
	});
}

const enroll = (
	uid: string,
	amountCents: number | null = null,
	type: 'card' | 'us_bank_account' = 'card',
	enrolledAt = '2026-10-01T00:00:00.000Z',
	leaseId = 'lease-1'
) =>
	db.seed(`leases/${leaseId}/autopay/${uid}`, {
		paymentMethodId: `pm_${uid}`,
		type,
		brand: type === 'card' ? 'visa' : 'STRIPE TEST BANK',
		last4: type === 'card' ? '4242' : '6789',
		amountCents,
		enrolledAt
	});

const invoices = () => services.stripe.invoices.create.mock.calls.map(([args]) => args);
const items = () => services.stripe.invoiceItems.create.mock.calls.map(([args]) => args);
const charge = (id: string, leaseId = 'lease-1') =>
	db.peek(`leases/${leaseId}/autopay_charges/${id}`) as Record<string, unknown> | undefined;
const emails = () =>
	services.sendEmail.mock.calls.map(([m]) => [m.to, m.subject] as [string, string]);

/** The webhook event Stripe sends for an invoice the job created. */
function invoiceEvent(
	type: 'invoice.payment_succeeded' | 'invoice.payment_failed',
	index = 0,
	createdDay = '2026-11-01'
) {
	const args = invoices()[index];
	return {
		type,
		created: Math.floor(Date.now() / 1000),
		data: {
			object: {
				id: `in_auto_${index + 1}`,
				status: type === 'invoice.payment_failed' ? 'open' : 'paid',
				created: Math.floor(at(createdDay).getTime() / 1000),
				customer: args.customer,
				metadata: args.metadata,
				lines: { data: [] }
			}
		}
	};
}
const send = (event: object) =>
	call(webhook, {
		rawBody: JSON.stringify(event),
		headers: { 'stripe-signature': VALID_STRIPE_SIGNATURE }
	});

const declineOnce = (message = 'Your card was declined.') =>
	services.stripe.invoices.pay.mockRejectedValueOnce(
		Object.assign(new Error(message), { type: 'StripeCardError', code: 'card_declined' })
	);
const processing = () =>
	services.stripe.invoices.pay.mockImplementation(async (id: string) => ({
		id,
		status: 'open',
		payment_intent: { id: `pi_${id}`, status: 'processing' }
	}));

describe('autopay: Autopay charge in the daily job', () => {
	it('Scenario: Charge on the due date: one invoice paid with the saved card, recorded by the webhook', async () => {
		setup();
		enroll('t1');

		const result = await runOn('2026-11-01');

		expect(result).toMatchObject({ status: 200, json: { autopayCharges: 1, errors: 0 } });
		expect(invoices()).toHaveLength(1);
		expect(invoices()[0]).toMatchObject({
			customer: 'cus_t1',
			collection_method: 'charge_automatically',
			auto_advance: false,
			default_payment_method: 'pm_t1',
			metadata: {
				leaseID: 'lease-1',
				propertyID: 'prop-1',
				rentCents: '100000',
				depositCents: '0',
				lateFeeCents: '0',
				feeCents: '2930',
				autopay: 'true',
				uid: 't1',
				cycleKey: '2026-11-01'
			}
		});
		expect(items().map((i) => [i.description, i.amount, i.invoice])).toEqual([
			['Rent', 100000, 'in_auto_1'],
			['Transaction Fee', 2930, 'in_auto_1']
		]);
		const [payId, payArgs, payKey] = services.stripe.invoices.pay.mock.calls[0];
		expect(payId).toBe('in_auto_1');
		expect(payArgs).toMatchObject({ off_session: true, payment_method: 'pm_t1' });
		expect(payKey).toEqual({ idempotencyKey: 'autopay-lease-1-2026-11-01-t1-a1-r0-pay' });
		expect(charge('2026-11-01_t1')).toMatchObject({
			state: 'succeeded',
			attempts: 1,
			amountCents: 100000,
			feeCents: 2930,
			invoiceId: 'in_auto_1'
		});
		const summary = (
			db.peek('_jobs/daily/runs/2026-11-01') as { runs: { autopayCharges: unknown[] }[] }
		).runs[0];
		expect(summary.autopayCharges).toEqual([
			{
				leaseId: 'lease-1',
				uid: 't1',
				cycleKey: '2026-11-01',
				attempt: 1,
				amountCents: 100000,
				feeCents: 2930,
				outcome: 'succeeded'
			}
		]);

		// The webhook records it like a Checkout payment and marks the charge recorded.
		expect((await send(invoiceEvent('invoice.payment_succeeded'))).status).toBe(200);
		const november = (
			db.peek('leases/lease-1/payment_history/2026') as Record<string, HistoryMonth>
		).November;
		expect(november.transactions).toHaveLength(1);
		expect(november.transactions[0]).toMatchObject({ amount: 1000, fee: 29.3 });
		expect(charge('2026-11-01_t1')).toMatchObject({
			state: 'succeeded',
			recordedAt: expect.any(String)
		});

		// Re-running the job charges nothing.
		await run();
		expect(invoices()).toHaveLength(1);
	});

	it('Scenario: Re-run on the same day before the webhook arrives: no second invoice', async () => {
		setup();
		enroll('t1');
		enroll('t2', null, 'card', '2026-10-02T00:00:00.000Z');
		await runOn('2026-11-01');
		await run();
		expect(invoices()).toHaveLength(1);
	});

	it('Scenario: Amount cap and next tenant: $300 then $700', async () => {
		setup();
		enroll('t2', null, 'card', '2026-10-02T00:00:00.000Z');
		enroll('t1', 30000);
		await runOn('2026-11-01');
		expect(
			invoices().map((i) => [i.metadata.uid, i.metadata.rentCents, i.metadata.feeCents])
		).toEqual([
			['t1', '30000', '900'],
			['t2', '70000', '2060']
		]);
	});

	it('Scenario: Bank account: no fee line and no fee in the metadata', async () => {
		setup();
		enroll('t1', null, 'us_bank_account');
		await runOn('2026-11-01');
		expect(invoices()[0].metadata.feeCents).toBe('0');
		expect(items().map((i) => i.description)).toEqual(['Rent']);
	});

	it('Scenario: Nothing due: rent payable early is not charged before its due date', async () => {
		setup();
		enroll('t1');
		await runOn('2026-10-28');
		expect(invoices()).toHaveLength(0);
	});

	it('Scenario: Overlapping runs: a charge claimed by another run is not made again', async () => {
		setup();
		enroll('t1');
		db.seed('leases/lease-1/autopay_charges/2026-11-01_t1', {
			uid: 't1',
			cycleKey: '2026-11-01',
			state: 'claimed',
			attempts: 1,
			lastAttemptDay: '2026-11-01',
			claimedAt: '2026-11-01T10:58:00.000Z',
			claimToken: 'other-run',
			amountCents: 100000,
			feeCents: 2930
		});
		await runOn('2026-11-01');
		expect(invoices()).toHaveLength(0);
	});

	it('Scenario: Crash after claiming: a stale claim continues with the same Stripe keys', async () => {
		setup();
		enroll('t1');
		db.seed('leases/lease-1/autopay_charges/2026-11-01_t1', {
			uid: 't1',
			cycleKey: '2026-11-01',
			state: 'claimed',
			attempts: 1,
			lastAttemptDay: '2026-11-01',
			claimedAt: '2026-11-01T10:00:00.000Z',
			claimToken: 'dead-run',
			amountCents: 100000,
			feeCents: 2930,
			invoiceId: null
		});
		await runOn('2026-11-01');
		expect(services.stripe.invoices.create.mock.calls[0][1]).toEqual({
			idempotencyKey: 'autopay-lease-1-2026-11-01-t1-a1-r0-invoice'
		});
		expect(charge('2026-11-01_t1')).toMatchObject({ state: 'succeeded', attempts: 1 });
	});

	it('a crashed attempt that left a draft invoice deletes it and starts over with new keys', async () => {
		setup();
		enroll('t1');
		db.seed('leases/lease-1/autopay_charges/2026-11-01_t1', {
			uid: 't1',
			cycleKey: '2026-11-01',
			state: 'claimed',
			attempts: 1,
			lastAttemptDay: '2026-11-01',
			claimedAt: '2026-11-01T10:00:00.000Z',
			amountCents: 100000,
			feeCents: 2930,
			invoiceId: 'in_left'
		});
		services.stripe.invoices.retrieve.mockResolvedValue({ id: 'in_left', status: 'draft' });
		await runOn('2026-11-01');
		expect(services.stripe.invoices.del).toHaveBeenCalledWith('in_left');
		expect(services.stripe.invoices.create.mock.calls[0][1]).toEqual({
			idempotencyKey: 'autopay-lease-1-2026-11-01-t1-a1-r1-invoice'
		});
		expect(charge('2026-11-01_t1')).toMatchObject({ state: 'succeeded', resume: 1 });
	});

	it('a crashed attempt whose invoice was paid is marked succeeded without a new invoice', async () => {
		setup();
		enroll('t1');
		db.seed('leases/lease-1/autopay_charges/2026-11-01_t1', {
			uid: 't1',
			cycleKey: '2026-11-01',
			state: 'claimed',
			attempts: 1,
			lastAttemptDay: '2026-11-01',
			claimedAt: '2026-11-01T10:00:00.000Z',
			amountCents: 100000,
			feeCents: 2930,
			invoiceId: 'in_left'
		});
		services.stripe.invoices.retrieve.mockResolvedValue({ id: 'in_left', status: 'paid' });
		await runOn('2026-11-01');
		expect(invoices()).toHaveLength(0);
		expect(charge('2026-11-01_t1')).toMatchObject({ state: 'succeeded' });
	});

	it('Scenario: One lease fails: the error is in the summary and other leases are charged', async () => {
		setup();
		seedLease('lease-2', { tenantIds: ['t2'], rent: 500, startDate: '2026-11-01' });
		enroll('t1');
		enroll('t2', null, 'card', '2026-10-01T00:00:00.000Z', 'lease-2');
		services.stripe.invoices.create.mockRejectedValueOnce(new Error('Stripe is down'));

		const result = await runOn('2026-11-01');

		expect(result.status).toBe(500);
		expect(invoices().map((i) => i.metadata.leaseID)).toEqual(['lease-1', 'lease-2']);
		const summary = (db.peek('_jobs/daily/runs/2026-11-01') as { runs: { errors: string[] }[] })
			.runs[0];
		expect(summary.errors).toEqual(['lease lease-1: autopay: Stripe is down']);
		expect(charge('2026-11-01_t2', 'lease-2')).toMatchObject({ state: 'succeeded' });
	});
});

describe('autopay: Failures and retries', () => {
	it('Scenario: Card declined: voided, marked failed, emailed, and the next tenant is tried', async () => {
		setup();
		enroll('t1', 30000);
		enroll('t2', null, 'card', '2026-10-02T00:00:00.000Z');
		declineOnce();

		await runOn('2026-11-01');

		expect(services.stripe.invoices.voidInvoice).toHaveBeenCalledWith('in_auto_1');
		expect(charge('2026-11-01_t1')).toMatchObject({
			state: 'failed',
			attempts: 1,
			error: 'Your card was declined.'
		});
		// t2 is charged everything owed, not just what was left after t1's $300.
		expect(invoices()[1].metadata).toMatchObject({ uid: 't2', rentCents: '100000' });
		expect(charge('2026-11-01_t2')).toMatchObject({ state: 'succeeded' });
		expect(emails()).toContainEqual(['t1@example.com', 'Your autopay payment did not go through']);
		const summary = (db.peek('_jobs/daily/runs/2026-11-01') as { runs: { errors: string[] }[] })
			.runs[0];
		expect(summary.errors).toEqual([]);
	});

	it('Scenario: Retries and Giving up: 3 daily retries, an email each time, then autopay stops', async () => {
		setup({ lateFee: 0 });
		enroll('t1');
		for (let i = 0; i < 4; i++) declineOnce();

		for (const day of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) {
			await runOn(day);
		}

		expect(invoices()).toHaveLength(4);
		expect(charge('2026-11-01_t1')).toMatchObject({
			state: 'gave-up',
			attempts: 4,
			gaveUpDay: '2026-11-04'
		});
		const sent = emails().filter(([to]) => to === 't1@example.com');
		expect(sent).toEqual([
			['t1@example.com', 'Your autopay payment did not go through'],
			['t1@example.com', 'Your autopay payment did not go through'],
			['t1@example.com', 'Your autopay payment did not go through'],
			['t1@example.com', 'Autopay stopped for this payment']
		]);
		// Every attempt used its own keys.
		expect(services.stripe.invoices.create.mock.calls.map(([, key]) => key.idempotencyKey)).toEqual(
			[
				'autopay-lease-1-2026-11-01-t1-a1-r0-invoice',
				'autopay-lease-1-2026-11-01-t1-a2-r0-invoice',
				'autopay-lease-1-2026-11-01-t1-a3-r0-invoice',
				'autopay-lease-1-2026-11-01-t1-a4-r0-invoice'
			]
		);

		// Autopay stays on: December's due date is charged.
		await runOn('2026-12-01');
		expect(invoices()).toHaveLength(5);
		expect(invoices()[4].metadata).toMatchObject({ cycleKey: '2026-12-01', rentCents: '200000' });
	});

	it('Scenario: Paid by hand meanwhile: no retry', async () => {
		setup();
		enroll('t1');
		declineOnce();
		await runOn('2026-11-01');
		db.seed('leases/lease-1/payment_history/2026', {
			November: { transactions: [{ amount: 1000, date: at('2026-11-01') }] }
		});
		await runOn('2026-11-02');
		expect(invoices()).toHaveLength(1);
	});

	it('Scenario: Email problems: a failure email that cannot be sent goes out on the next run', async () => {
		setup({ lateFee: 0 });
		enroll('t1');
		declineOnce();
		services.sendEmail.mockRejectedValueOnce(new Error('provider down'));

		await runOn('2026-11-01');
		expect(charge('2026-11-01_t1')).toMatchObject({ state: 'failed' });
		const toT1 = () => emails().filter(([to]) => to === 't1@example.com');
		expect(toT1()).toEqual([['t1@example.com', 'Your autopay payment did not go through']]);

		// Next day: the retry succeeds, and the first failure email is sent after all.
		await runOn('2026-11-02');
		expect(charge('2026-11-01_t1')).toMatchObject({ state: 'succeeded', attempts: 2 });
		expect(toT1()).toEqual([
			['t1@example.com', 'Your autopay payment did not go through'],
			['t1@example.com', 'Your autopay payment did not go through']
		]);
		expect(db.peek('leases/lease-1/notices/autopay-failed-2026-11-01-1-t1')).toMatchObject({
			sentAt: expect.any(String)
		});
	});
});

describe('autopay: Pending and settled state, late fees', () => {
	it('Scenario: ACH in progress and Pending ACH: pending, and no late fee while it settles', async () => {
		setup();
		enroll('t1', null, 'us_bank_account');
		processing();

		await runOn('2026-11-01');
		expect(charge('2026-11-01_t1')).toMatchObject({ state: 'pending' });

		// The grace period ends on 2026-11-06; the 2026-11-07 run would charge the fee.
		await runOn('2026-11-07');
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toBeUndefined();
		expect(invoices()).toHaveLength(1);
	});

	it('Scenario: Charge settles: recorded on its charge day, so the month is on time', async () => {
		setup();
		enroll('t1', null, 'us_bank_account');
		processing();
		await runOn('2026-11-01');

		vi.setSystemTime(at('2026-11-08'));
		expect((await send(invoiceEvent('invoice.payment_succeeded', 0, '2026-11-01'))).status).toBe(
			200
		);
		expect(charge('2026-11-01_t1')).toMatchObject({
			state: 'succeeded',
			recordedAt: expect.any(String)
		});

		await runOn('2026-11-08');
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toBeUndefined();
	});

	it('Scenario: Pending ACH fails: marked failed, emailed, late fees resume and the charge is retried', async () => {
		setup();
		enroll('t1', null, 'us_bank_account');
		processing();
		await runOn('2026-11-01');

		vi.setSystemTime(at('2026-11-07'));
		expect((await send(invoiceEvent('invoice.payment_failed'))).status).toBe(200);
		expect(charge('2026-11-01_t1')).toMatchObject({
			state: 'failed',
			failures: [{ attempt: 1, day: '2026-11-07', amountCents: 100000 }]
		});
		expect(services.stripe.invoices.voidInvoice).toHaveBeenCalledWith('in_auto_1');

		services.stripe.invoices.pay.mockImplementation(async (id: string) => ({ id, status: 'paid' }));
		await runOn('2026-11-07');
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toMatchObject({ amount: 50 });
		expect(charge('2026-11-01_t1')).toBeDefined();
		// The new cycle (the late fee's due date) charges rent and fee together.
		expect(invoices()[1].metadata).toMatchObject({
			cycleKey: '2026-11-07',
			rentCents: '100000',
			lateFeeCents: '5000'
		});
		expect(emails()).toContainEqual(['t1@example.com', 'Your autopay payment did not go through']);
	});

	it('Scenario: Webhook redelivery: payment and failure events change nothing the second time', async () => {
		setup();
		enroll('t1', null, 'us_bank_account');
		processing();
		await runOn('2026-11-01');

		await send(invoiceEvent('invoice.payment_failed'));
		const afterFirst = charge('2026-11-01_t1');
		await send(invoiceEvent('invoice.payment_failed'));
		expect(charge('2026-11-01_t1')).toEqual(afterFirst);

		const paid = invoiceEvent('invoice.payment_succeeded');
		await send(paid);
		await send(paid);
		const november = (
			db.peek('leases/lease-1/payment_history/2026') as Record<string, HistoryMonth>
		).November;
		expect(november.transactions).toHaveLength(1);
	});

	it('a payment failure for an invoice that is not autopay is ignored', async () => {
		setup();
		const result = await send({
			type: 'invoice.payment_failed',
			created: 1,
			data: { object: { id: 'in_x', metadata: { leaseID: 'lease-1' }, lines: { data: [] } } }
		});
		expect(result.status).toBe(200);
		expect(services.stripe.invoices.voidInvoice).not.toHaveBeenCalled();
	});
});

describe('autopay: Reminders for autopay tenants', () => {
	it('Scenario: Notice and Others unaffected: the enrolled tenant gets the autopay notice instead', async () => {
		setup();
		enroll('t1');

		await runOn('2026-10-25');

		expect(emails()).toEqual([
			['t1@example.com', 'Autopay will charge $1,029.30 on November 1, 2026'],
			['t2@example.com', 'Rent for November 2026 is due on November 1, 2026']
		]);
		const text = services.sendEmail.mock.calls[0][0].text as string;
		expect(text).toContain('Visa ending 4242');
		expect(text).toContain('$29.30 card transaction fee');
		expect(text).toContain('Lehman Family LLC');

		// Scenario: Sent once.
		await run();
		expect(emails()).toHaveLength(2);

		// On the due day only the other tenant gets the due-today reminder.
		services.sendEmail.mockClear();
		await runOn('2026-11-01');
		expect(emails()).toEqual([['t2@example.com', 'Rent for November 2026 is due today']]);
	});

	it('a tenant with autopay on whom earlier tenants leave nothing to pay keeps the usual reminders', async () => {
		setup();
		enroll('t1');
		enroll('t2', null, 'card', '2026-10-02T00:00:00.000Z');
		await runOn('2026-10-25');
		expect(emails()).toEqual([
			['t1@example.com', 'Autopay will charge $1,029.30 on November 1, 2026'],
			['t2@example.com', 'Rent for November 2026 is due on November 1, 2026']
		]);
	});

	it('a tenant charged on the due date is not reminded before the webhook records the payment', async () => {
		setup();
		enroll('t1');
		await runOn('2026-11-01');
		expect(emails()).toEqual([['t2@example.com', 'Rent for November 2026 is due today']]);
	});

	it('late-fee notices still go to everyone', async () => {
		setup();
		enroll('t1');
		declineOnce();
		for (let i = 0; i < 6; i++) declineOnce();
		await runOn('2026-11-07');
		expect(emails()).toContainEqual(['t1@example.com', 'Late fee added for November 2026']);
		expect(emails()).toContainEqual(['t2@example.com', 'Late fee added for November 2026']);
	});
});

describe('autopay: review fixes', () => {
	it('Scenario: Turn off during a run: a tenant who turned autopay off is not charged', async () => {
		setup();
		enroll('t1', 30000);
		enroll('t2', null, 'card', '2026-10-02T00:00:00.000Z');
		// t2 turns autopay off while t1's charge is being made.
		services.stripe.invoices.pay.mockImplementationOnce(async (id: string) => {
			db.remove('leases/lease-1/autopay/t2');
			return { id, status: 'paid' };
		});
		await runOn('2026-11-01');
		expect(invoices().map((i) => i.metadata.uid)).toEqual(['t1']);
	});

	it('a lost payment_failed event: the next run asks Stripe, marks the charge failed and retries', async () => {
		setup({ lateFee: 0 });
		enroll('t1', null, 'us_bank_account');
		processing();
		await runOn('2026-11-01');
		expect(charge('2026-11-01_t1')).toMatchObject({ state: 'pending' });

		// Stripe says the invoice is open with a failed payment; the webhook never arrived.
		services.stripe.invoices.retrieve.mockResolvedValue({
			id: 'in_auto_1',
			status: 'open',
			payment_intent: {
				status: 'requires_payment_method',
				last_payment_error: { message: 'The account is closed.' }
			}
		});
		services.stripe.invoices.pay.mockImplementation(async (id: string) => ({ id, status: 'paid' }));
		await runOn('2026-11-05');

		expect(services.stripe.invoices.voidInvoice).toHaveBeenCalledWith('in_auto_1');
		expect(charge('2026-11-01_t1')).toMatchObject({ state: 'succeeded', attempts: 2 });
		expect((charge('2026-11-01_t1')!.failures as unknown[])[0]).toMatchObject({
			attempt: 1,
			day: '2026-11-05',
			error: 'The account is closed.'
		});
		expect(emails()).toContainEqual(['t1@example.com', 'Your autopay payment did not go through']);
	});

	it('a pending charge Stripe still shows as processing is left alone', async () => {
		setup({ lateFee: 0 });
		enroll('t1', null, 'us_bank_account');
		processing();
		await runOn('2026-11-01');
		services.stripe.invoices.retrieve.mockResolvedValue({
			id: 'in_auto_1',
			status: 'open',
			payment_intent: { status: 'processing' }
		});
		await runOn('2026-11-03');
		expect(charge('2026-11-01_t1')).toMatchObject({ state: 'pending' });
		expect(invoices()).toHaveLength(1);
	});

	it('a payment_failed event that beats the job’s own record of a decline is counted once', async () => {
		setup({ lateFee: 0 });
		enroll('t1');
		services.stripe.invoices.pay.mockImplementationOnce(async () => {
			// Stripe's event arrives while the job is still waiting for the pay call.
			await send(invoiceEvent('invoice.payment_failed'));
			throw Object.assign(new Error('Your card was declined.'), { type: 'StripeCardError' });
		});
		await runOn('2026-11-01');
		const record = charge('2026-11-01_t1')!;
		expect(record).toMatchObject({ state: 'failed', attempts: 1 });
		expect(record.failures).toHaveLength(1);
	});

	it('a crashed claim whose amount no longer matches what is owed starts over under new keys', async () => {
		setup();
		enroll('t1');
		db.seed('leases/lease-1/autopay_charges/2026-11-01_t1', {
			uid: 't1',
			cycleKey: '2026-11-01',
			state: 'claimed',
			attempts: 1,
			lastAttemptDay: '2026-11-01',
			claimedAt: '2026-11-01T10:00:00.000Z',
			amountCents: 120000,
			feeCents: 3510,
			invoiceId: null
		});
		await runOn('2026-11-01');
		expect(services.stripe.invoices.create.mock.calls[0][1]).toEqual({
			idempotencyKey: 'autopay-lease-1-2026-11-01-t1-a1-r1-invoice'
		});
		expect(charge('2026-11-01_t1')).toMatchObject({
			state: 'succeeded',
			amountCents: 100000,
			feeCents: 2930
		});
	});

	it('a crashed claim whose invoice settled keeps the amount it was invoiced for', async () => {
		setup();
		enroll('t1');
		db.seed('leases/lease-1/autopay_charges/2026-11-01_t1', {
			uid: 't1',
			cycleKey: '2026-11-01',
			state: 'claimed',
			attempts: 1,
			lastAttemptDay: '2026-11-01',
			claimedAt: '2026-11-01T10:00:00.000Z',
			amountCents: 70000,
			feeCents: 2060,
			invoiceId: 'in_left'
		});
		services.stripe.invoices.retrieve.mockResolvedValue({ id: 'in_left', status: 'paid' });
		await runOn('2026-11-01');
		expect(charge('2026-11-01_t1')).toMatchObject({ state: 'succeeded', amountCents: 70000 });
	});

	it('an idempotency conflict on the invoice starts over once under new keys', async () => {
		setup();
		enroll('t1');
		services.stripe.invoices.create.mockRejectedValueOnce(
			Object.assign(
				new Error('Keys for idempotent requests can only be used with the same parameters'),
				{
					type: 'StripeIdempotencyError'
				}
			)
		);
		await runOn('2026-11-01');
		expect(services.stripe.invoices.create.mock.calls.map(([, key]) => key.idempotencyKey)).toEqual(
			['autopay-lease-1-2026-11-01-t1-a1-r0-invoice', 'autopay-lease-1-2026-11-01-t1-a1-r1-invoice']
		);
		expect(charge('2026-11-01_t1')).toMatchObject({ state: 'succeeded', resume: 1 });
	});
});
