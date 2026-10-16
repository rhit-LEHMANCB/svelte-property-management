import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { POST as startPayment } from '../../src/routes/api/stripe/create-checkout-session/payment/+server';
import { GET as openPortal } from '../../src/routes/api/stripe/create-customer-portal/+server';
import { POST as webhook } from '../../src/routes/api/stripe/webhook/+server';
import { FakeDocRef, FakeTimestamp } from '../helpers/fakeFirestore';
import { getMonthKey } from '../../src/lib/server/payments';
import { load as paymentLoad } from '../../src/routes/(authenticated)/payment/+page.server';
import { call } from '../helpers/callHandler';
import { VALID_STRIPE_SIGNATURE, services } from '../helpers/services';
import { db, seedLease, seedProperty, seedTenant } from '../helpers/seed';

// Next month's rent becomes payable 7 days before it is due, so balances depend on the day of the
// month. Pin "now" to mid-month so these tests mean the same thing on every day they run.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-03-12T17:00:00Z'));
});
afterEach(() => vi.useRealTimers());

/** The first day of the month `monthsAgo` months before this one, as YYYY-MM-DD. */
const monthStart = (monthsAgo = 0) => {
	const current = getMonthKey(new Date());
	return `${getMonthKey(new Date(Date.UTC(current.year, current.month - 1 - monthsAgo, 15))).key}-01`;
};

/** The last day of the month `monthsAgo` months before this one, as YYYY-MM-DD. */
const monthEnd = (monthsAgo = 0) => {
	const [year, month] = monthStart(monthsAgo).split('-').map(Number);
	return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

/** Tenant t1 on lease-1 at prop-1, rent 1000, starting this month (or `monthsAgo` months back). */
const setupTenant = (monthsAgo = 0) => {
	seedTenant('t1', { stripeID: 'cus_t1' });
	seedProperty('prop-1', {
		streetAddress: '1 Main St',
		city: 'Terre Haute',
		state: 'IN',
		rent: 1200
	});
	seedLease('lease-1', {
		propertyId: 'prop-1',
		tenantIds: ['t1'],
		rent: 1000,
		startDate: monthStart(monthsAgo)
	});
};

const pay = (amount: unknown, leaseId: string | undefined = 'lease-1', userID = 't1') =>
	call(startPayment, { userID, body: { amount, leaseId } });

/** What the authenticated layout hands the payment page for a tenant's leases. */
const parentFor = (
	...leases: {
		id: string;
		startDate: string;
		endDate?: string | null;
		rent?: number;
		status?: string;
	}[]
) => ({
	userLeases: leases.map((l) => ({
		id: l.id,
		propertyId: 'prop-1',
		address: '1 Main St, Terre Haute',
		rent: l.rent ?? 1000,
		startDate: l.startDate,
		endDate: l.endDate ?? null,
		status: l.status ?? 'current',
		otherTenants: [],
		hasDocument: false
	}))
});

describe('rent-payments: start a payment (POST /api/stripe/create-checkout-session/payment)', () => {
	it('Scenario: Valid amount creates a session with a Rent line, a 2.9% + $0.30 fee line and the lease metadata', async () => {
		setupTenant();

		const result = await pay(1000);

		expect(result).toMatchObject({ status: 200, json: { url: 'https://checkout.test/session' } });
		expect(services.stripe.checkout.sessions.create).toHaveBeenCalledOnce();
		const session = services.stripe.checkout.sessions.create.mock.calls[0][0];
		expect(session.customer).toBe('cus_t1');
		expect(session.mode).toBe('payment');
		const [rent, fee] = session.line_items;
		expect(rent.price_data.product_data.name).toBe('Rent');
		expect(rent.price_data.product_data.description).toBe(
			'Rent payment for 1 Main St, Terre Haute, IN'
		);
		expect(rent.price_data.unit_amount).toBe(100000);
		expect(rent.price_data.currency).toBe('usd');
		expect(fee.price_data.product_data.name).toBe('Transaction Fee');
		// autopay: the fee line no longer says that auto-pay waives it.
		expect(fee.price_data.product_data.description).toBe(
			'Transaction fee for one-time card payment.'
		);
		// $1000 * 2.9% + $0.30 = $29.30
		expect(fee.price_data.unit_amount).toBe(2930);
		expect(session.invoice_creation.invoice_data.metadata).toEqual({
			leaseID: 'lease-1',
			propertyID: 'prop-1',
			rentCents: '100000',
			depositCents: '0',
			lateFeeCents: '0',
			feeCents: '2930'
		});
		expect(session.success_url).toBe(`${PUBLIC_FRONTEND_URL}/payment/success`);
		expect(session.cancel_url).toBe(`${PUBLIC_FRONTEND_URL}/payment`);
	});

	it('Scenario: the fee is rounded to whole cents', async () => {
		setupTenant();

		await pay(333);

		const [, fee] = services.stripe.checkout.sessions.create.mock.calls[0][0].line_items;
		// 33300 * 0.029 + 30 = 995.7 cents -> 996
		expect(fee.price_data.unit_amount).toBe(996);
	});

	it('Scenario: an amount above the balance responds 400 and creates no session', async () => {
		setupTenant();

		const result = await pay(1000.01);

		expect(result).toMatchObject({ status: 400, error: 'Amount is greater than the balance owed' });
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('Scenario: the cap shrinks with payments already made this month', async () => {
		setupTenant();
		const { year, monthName } = getMonthKey(new Date());
		db.seed(`leases/lease-1/payment_history/${year}`, {
			[monthName]: { remainingBalance: 600, transactions: [] }
		});

		expect((await pay(600.01)).status).toBe(400);
		expect((await pay(600)).status).toBe(200);
	});

	it("Scenario: unpaid past months since the lease's start raise the cap", async () => {
		setupTenant(2);

		expect((await pay(3000.01)).status).toBe(400);
		expect((await pay(3000)).status).toBe(200);
	});

	it("Scenario: Not the tenant's lease: missing, unknown or someone else's lease responds 403", async () => {
		setupTenant();
		seedTenant('t2');
		seedLease('lease-2', { propertyId: 'prop-1', tenantIds: ['t2'], startDate: monthStart() });

		for (const leaseId of [undefined, '', 'nope', 'lease-2']) {
			const result = await call(startPayment, { userID: 't1', body: { amount: 100, leaseId } });
			expect(result).toMatchObject({
				status: 403,
				error: 'You can only pay for a lease you are on.'
			});
		}
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('an ended lease with unpaid rent can still be paid, up to what it owes', async () => {
		seedTenant('t1', { stripeID: 'cus_t1' });
		seedProperty('prop-1');
		seedLease('old', {
			propertyId: 'prop-1',
			tenantIds: ['t1'],
			rent: 1000,
			startDate: monthStart(3),
			endDate: monthEnd(2)
		});

		expect((await pay(2000.01, 'old')).status).toBe(400);
		expect((await pay(2000, 'old')).status).toBe(200);
	});

	it('Scenario: negative or fractional-cent amounts respond 400 and create no session', async () => {
		setupTenant();

		for (const amount of [-5, 10.005, 0.001]) {
			expect((await pay(amount)).status).toBe(400);
		}
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('Scenario: amounts are rounded to whole cents for Stripe', async () => {
		setupTenant();

		await pay(19.99);

		const [rent] = services.stripe.checkout.sessions.create.mock.calls[0][0].line_items;
		expect(rent.price_data.unit_amount).toBe(1999);
	});

	it('Scenario: Invalid amount (missing, zero or not a number) responds 400 and creates no session', async () => {
		setupTenant();

		for (const body of [{}, { amount: 0 }, { amount: '50' }, { amount: null }]) {
			const result = await call(startPayment, {
				userID: 't1',
				body: { ...body, leaseId: 'lease-1' }
			});
			expect(result.status).toBe(400);
			expect(result.error).toBe('Amount must be a provided number for the amount to charge');
		}
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('Scenario: Upcoming lease: nothing is owed yet, so any amount responds 400', async () => {
		seedTenant('t1');
		seedProperty('prop-1');
		seedLease('soon', { propertyId: 'prop-1', tenantIds: ['t1'], startDate: '2099-01-01' });

		const result = await pay(100, 'soon');

		expect(result).toMatchObject({ status: 400, error: 'Amount is greater than the balance owed' });
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('Scenario: a session without a URL responds 500', async () => {
		setupTenant();
		services.stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: null });

		const result = await pay(100);

		expect(result.status).toBe(500);
	});

	it('Scenario: an anonymous caller is rejected with 401', async () => {
		const result = await call(startPayment, { userID: null, body: { amount: 100 } });

		expect(result.status).toBe(401);
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});
});

describe('rent-payments: manage payment methods (GET /api/stripe/create-customer-portal)', () => {
	it('Scenario: Portal creates a session for the user’s customer returning to /payment', async () => {
		seedTenant('t1', { stripeID: 'cus_t1' });

		const result = await call(openPortal, { method: 'GET', userID: 't1' });

		expect(result).toMatchObject({ status: 200, json: { url: 'https://portal.test/session' } });
		expect(services.stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
			customer: 'cus_t1',
			return_url: `${PUBLIC_FRONTEND_URL}/payment`
		});
	});

	it('Scenario: No Stripe customer responds 400', async () => {
		seedTenant('t1', { stripeID: undefined });

		const result = await call(openPortal, { method: 'GET', userID: 't1' });

		expect(result).toMatchObject({ status: 400, error: 'No Stripe Customer ID found for user' });
		expect(services.stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
	});

	it('Scenario: an anonymous caller is rejected with 401', async () => {
		expect((await call(openPortal, { method: 'GET', userID: null })).status).toBe(401);
	});
});

describe('rent-payments: record payments (POST /api/stripe/webhook)', () => {
	// Mid-month, mid-day UTC so the month and year are the same in every timezone.
	const created = Date.UTC(2026, 2, 15, 12, 0, 0) / 1000;

	const invoiceEvent = (lines: { description: string; amount: number }[], leaseID = 'lease-1') => ({
		type: 'invoice.payment_succeeded',
		data: {
			object: {
				id: 'in_1',
				created,
				customer: 'cus_t1',
				metadata: { leaseID, propertyID: 'prop-1' } as Record<string, string>,
				lines: { data: lines }
			}
		}
	});
	/** lease-1 at prop-1, rent 1000, starting March 2026 (or `startDate`). */
	const seedPaidLease = (startDate = '2026-03-01') => {
		seedProperty('prop-1', { rent: 1200 });
		seedLease('lease-1', { propertyId: 'prop-1', tenantIds: ['t1'], rent: 1000, startDate });
	};
	const send = (event: object, signature: string | null = VALID_STRIPE_SIGNATURE) =>
		call(webhook, {
			rawBody: JSON.stringify(event),
			headers: signature ? { 'stripe-signature': signature } : {}
		});
	const history = () => db.peek('leases/lease-1/payment_history/2026');

	it('Scenario: First payment of the month sets remainingBalance to rent minus the amount and appends the transaction', async () => {
		seedPaidLease();

		const result = await send(
			invoiceEvent([
				{ description: 'Rent', amount: 40000 },
				{ description: 'Transaction Fee', amount: 1190 }
			])
		);

		expect(result.status).toBe(200);
		await vi.waitFor(() => expect(history()).toBeDefined());
		const march = (history() as { March: { remainingBalance: number; transactions: unknown[] } })
			.March;
		expect(march.remainingBalance).toBe(600);
		expect(march.transactions).toHaveLength(1);
		const [transaction] = march.transactions as { date: FakeTimestamp; amount: number }[];
		expect(transaction.amount).toBe(400);
		expect(transaction.date.toMillis()).toBe(created * 1000);
	});

	it('Scenario: Later payment in the month decrements remainingBalance and appends the transaction', async () => {
		seedPaidLease();
		const earlier = { date: FakeTimestamp.fromMillis(created * 1000 - 86_400_000), amount: 400 };
		db.seed('leases/lease-1/payment_history/2026', {
			March: { remainingBalance: 600, transactions: [earlier] }
		});

		await send(invoiceEvent([{ description: 'Rent', amount: 25000 }]));

		await vi.waitFor(() =>
			expect((history() as { March: { remainingBalance: number } }).March.remainingBalance).toBe(
				350
			)
		);
		const march = (history() as { March: { transactions: { amount: number }[] } }).March;
		expect(march.transactions.map((t) => t.amount)).toEqual([400, 250]);
	});

	it('Scenario: a first payment in a new month leaves earlier months untouched', async () => {
		seedPaidLease();
		db.seed('leases/lease-1/payment_history/2026', {
			February: { remainingBalance: 0, transactions: [] }
		});

		await send(invoiceEvent([{ description: 'Rent', amount: 100000 }]));

		await vi.waitFor(() => expect(history()).toHaveProperty('March'));
		expect(history()).toMatchObject({
			February: { remainingBalance: 0, transactions: [] },
			March: { remainingBalance: 0 }
		});
	});

	it('Scenario: metadata amounts record the rent and the fee on the transaction', async () => {
		seedPaidLease();
		const event = invoiceEvent([{ description: 'Something else', amount: 1 }]);
		(event.data.object.metadata as Record<string, string>).rentCents = '40000';
		(event.data.object.metadata as Record<string, string>).feeCents = '1190';

		const result = await send(event);

		expect(result.status).toBe(200);
		const march = (
			history() as {
				March: { remainingBalance: number; transactions: { amount: number; fee: number }[] };
			}
		).March;
		expect(march.remainingBalance).toBe(600);
		expect(march.transactions[0]).toMatchObject({ amount: 400, fee: 11.9 });
	});

	it('Scenario: the fallback Rent and Transaction Fee lines record the fee too', async () => {
		seedPaidLease();

		await send(
			invoiceEvent([
				{ description: 'Rent', amount: 40000 },
				{ description: 'Transaction Fee', amount: 1190 }
			])
		);

		const march = (history() as { March: { transactions: { fee: number }[] } }).March;
		expect(march.transactions[0].fee).toBe(11.9);
	});

	it('Scenario: an invoice created just before midnight local time lands in that month', async () => {
		seedPaidLease();
		// 23:30 on 31 March in Indianapolis (EDT) is 03:30 UTC on 1 April.
		const late = Date.UTC(2026, 3, 1, 3, 30, 0) / 1000;
		const event = invoiceEvent([{ description: 'Rent', amount: 10000 }]);
		event.data.object.created = late;

		await send(event);

		expect(history()).toHaveProperty('March');
		expect(history()).not.toHaveProperty('April');
	});

	it('Scenario: a failed Firestore write responds 500 so Stripe retries', async () => {
		seedPaidLease();
		const failing = vi.spyOn(FakeDocRef.prototype, 'set').mockRejectedValue(new Error('boom'));

		const result = await send(invoiceEvent([{ description: 'Rent', amount: 10000 }]));

		failing.mockRestore();
		expect(result.status).toBe(500);
	});

	it('Scenario: a payment toward carried-over months clears the oldest months first', async () => {
		seedPaidLease('2026-01-01');
		const event = invoiceEvent([{ description: 'Rent', amount: 150000 }]);
		Object.assign(event.data.object.metadata, { rentCents: '150000' });

		await send(event);

		const h = history() as Record<
			string,
			{ remainingBalance: number; transactions: { amount: number }[] }
		>;
		expect(h.January.remainingBalance).toBe(0);
		expect(h.February.remainingBalance).toBe(500);
		expect(h.March).toBeUndefined();
		expect(h.January.transactions[0].amount).toBe(1000);
		expect(h.February.transactions[0].amount).toBe(500);
	});

	it('Scenario: paying the whole carried-over total leaves nothing owed on /payment', async () => {
		setupTenant(2);
		const checkout = await pay(3000);
		expect(checkout.status).toBe(200);
		const metadata =
			services.stripe.checkout.sessions.create.mock.calls[0][0].invoice_creation.invoice_data
				.metadata;
		expect(metadata.leaseID).toBe('lease-1');

		await call(webhook, {
			rawBody: JSON.stringify({
				type: 'invoice.payment_succeeded',
				data: { object: { created: Date.now() / 1000, metadata, lines: { data: [] } } }
			}),
			headers: { 'stripe-signature': VALID_STRIPE_SIGNATURE }
		});

		const parent = parentFor({ id: 'lease-1', startDate: monthStart(2) });
		expect((await call(paymentLoad, { userID: 't1', parent })).data.leases).toMatchObject([
			{ id: 'lease-1', balanceCents: 0, dueDate: null }
		]);
	});

	it("Scenario: Invoice without a lease is recorded against the payer's current lease at that property", async () => {
		seedTenant('t1', { stripeID: 'cus_t1' });
		seedProperty('prop-1');
		seedLease('lease-old', {
			propertyId: 'prop-1',
			tenantIds: ['t1'],
			startDate: '2025-01-01',
			endDate: '2025-12-31'
		});
		seedLease('lease-1', {
			propertyId: 'prop-1',
			tenantIds: ['t1'],
			rent: 1000,
			startDate: '2026-01-01'
		});
		const event = invoiceEvent([{ description: 'Rent', amount: 40000 }]);
		event.data.object.metadata = { propertyID: 'prop-1' };

		expect((await send(event)).status).toBe(200);

		expect(history()).toMatchObject({ January: { remainingBalance: 600 } });
		expect(db.peek('leases/lease-old/payment_history/2026')).toBeUndefined();
		expect(db.peek('leases/lease-1/recorded_invoices/in_1')).toBeDefined();
	});

	it('Scenario: Invoice without a lease and no matching lease is logged as an error and acknowledged', async () => {
		seedTenant('t1', { stripeID: 'cus_t1' });
		seedProperty('prop-1');
		const event = invoiceEvent([{ description: 'Rent', amount: 40000 }]);
		event.data.object.metadata = { propertyID: 'prop-1' };
		const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		try {
			expect((await send(event)).status).toBe(200);
			expect(errors).toHaveBeenCalledWith(
				expect.stringMatching(
					/^UNRECORDED PAYMENT: no lease matches this invoice\. invoice=in_1 customer=cus_t1 .*totalCents=40000/
				)
			);
		} finally {
			errors.mockRestore();
		}
		expect((await db.collection('leases').get()).size).toBe(0);
	});

	it("Scenario: Shared lease: one tenant's payment lowers the balance both see", async () => {
		seedTenant('t1', { stripeID: 'cus_t1' });
		seedTenant('t2', { stripeID: 'cus_t2' });
		seedProperty('prop-1');
		seedLease('lease-1', {
			propertyId: 'prop-1',
			tenantIds: ['t1', 't2'],
			rent: 1000,
			startDate: monthStart()
		});
		await call(webhook, {
			rawBody: JSON.stringify({
				type: 'invoice.payment_succeeded',
				data: {
					object: {
						id: 'in_shared',
						created: Date.now() / 1000,
						customer: 'cus_t1',
						metadata: { leaseID: 'lease-1', propertyID: 'prop-1', rentCents: '50000' },
						lines: { data: [] }
					}
				}
			}),
			headers: { 'stripe-signature': VALID_STRIPE_SIGNATURE }
		});

		const parent = parentFor({ id: 'lease-1', startDate: monthStart() });
		for (const userID of ['t1', 't2']) {
			expect((await call(paymentLoad, { userID, parent })).data.leases[0].balanceCents).toBe(50000);
		}
	});

	it('Scenario: a payment across a year boundary is recorded in both year documents', async () => {
		seedPaidLease('2025-12-01');
		const event = invoiceEvent([{ description: 'Rent', amount: 150000 }]);
		event.data.object.created = Date.UTC(2026, 0, 15, 12) / 1000;
		Object.assign(event.data.object.metadata, { rentCents: '150000' });

		const result = await send(event);

		expect(result.status).toBe(200);
		expect(db.peek('leases/lease-1/payment_history/2025')).toMatchObject({
			December: { remainingBalance: 0 }
		});
		expect(history()).toMatchObject({ January: { remainingBalance: 500 } });
	});

	it('Scenario: a failed write in a multi-year payment responds 500', async () => {
		seedPaidLease('2025-12-01');
		const event = invoiceEvent([{ description: 'Rent', amount: 150000 }]);
		event.data.object.created = Date.UTC(2026, 0, 15, 12) / 1000;
		Object.assign(event.data.object.metadata, { rentCents: '150000' });
		const failing = vi
			.spyOn(FakeDocRef.prototype, 'set')
			.mockImplementationOnce(async () => {})
			.mockRejectedValue(new Error('boom'));

		const result = await send(event);

		failing.mockRestore();
		expect(result.status).toBe(500);
		// Nothing partial is left behind, not even the first year's document.
		expect(db.peek('leases/lease-1/payment_history/2025')).toBeUndefined();
		expect(history()).toBeUndefined();
		expect(db.peek('leases/lease-1/recorded_invoices/in_1')).toBeUndefined();
	});

	it('Scenario: redelivery of an already recorded invoice is acknowledged and not counted twice', async () => {
		seedPaidLease();
		const event = invoiceEvent([{ description: 'Rent', amount: 40000 }]);

		expect((await send(event)).status).toBe(200);
		expect((await send(event)).status).toBe(200);

		const march = (history() as { March: { remainingBalance: number; transactions: unknown[] } })
			.March;
		expect(march.remainingBalance).toBe(600);
		expect(march.transactions).toHaveLength(1);
	});

	it('Scenario: an entry without a numeric remainingBalance is treated as unrecorded', async () => {
		seedPaidLease();
		db.seed('leases/lease-1/payment_history/2026', { March: { transactions: [] } });

		await send(invoiceEvent([{ description: 'Rent', amount: 40000 }]));

		expect((history() as { March: { remainingBalance: number } }).March.remainingBalance).toBe(600);
	});

	it('Scenario: Bad signature responds 400 and records nothing', async () => {
		seedProperty('prop-1');

		const result = await send(invoiceEvent([{ description: 'Rent', amount: 100 }]), 'forged');

		expect(result.status).toBe(400);
		expect(result.error).toMatch(/^Webhook Error: /);
		expect(history()).toBeUndefined();
	});

	it('Scenario: a missing signature header responds 400 "Stripe sig is required"', async () => {
		const result = await send(invoiceEvent([{ description: 'Rent', amount: 100 }]), null);

		expect(result).toMatchObject({ status: 400, error: 'Stripe sig is required' });
		expect(services.stripe.webhooks.constructEvent).not.toHaveBeenCalled();
	});

	it('Scenario: Unrelated event is acknowledged with 200 and records nothing', async () => {
		seedProperty('prop-1');

		const result = await send({ type: 'customer.created', data: { object: {} } });

		expect(result.status).toBe(200);
		expect(history()).toBeUndefined();
	});

	it('Scenario: an invoice with no Rent line is acknowledged and records nothing', async () => {
		seedProperty('prop-1');

		const result = await send(invoiceEvent([{ description: 'Transaction Fee', amount: 500 }]));

		expect(result.status).toBe(200);
		expect(history()).toBeUndefined();
	});

	it('Scenario: Unknown property: an invoice naming a missing lease is logged and answered 500', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let result;
		try {
			result = await send(invoiceEvent([{ description: 'Rent', amount: 100000 }], 'missing-lease'));
			expect(errors).toHaveBeenCalledWith(
				expect.stringMatching(
					/^UNRECORDED PAYMENT: the lease this invoice names does not exist\. invoice=in_1 customer=cus_t1 lease=missing-lease .*totalCents=100000/
				)
			);
		} finally {
			errors.mockRestore();
		}

		expect(result.status).toBe(500);
		expect(db.peek('leases/missing-lease/payment_history/2026')).toBeUndefined();
		expect(db.peek('leases/missing-lease/recorded_invoices/in_1')).toBeUndefined();
	});
});

describe('rent-payments: balance and due date (/payment load)', () => {
	it('Scenario: a tenant with no lease is sent to the dashboard', async () => {
		setupTenant();

		const result = await call(paymentLoad, { userID: 't1', parent: {} });

		expect(result).toMatchObject({ status: 303, redirect: '/' });
	});

	it('Scenario: No payments yet shows the rent due on the 1st of this month', async () => {
		setupTenant();

		const result = await call(paymentLoad, {
			userID: 't1',
			parent: parentFor({ id: 'lease-1', startDate: monthStart() })
		});

		expect(result.data.leases).toEqual([
			{
				id: 'lease-1',
				address: '1 Main St, Terre Haute',
				status: 'current',
				startDate: monthStart(),
				endDate: null,
				balanceCents: 100000,
				dueDate: monthStart(),
				owed: { lateFeesCents: 0, depositCents: 0, rentCents: 100000 },
				creditCents: 0
			}
		]);
	});

	it('Scenario: Partial payment lowers the balance', async () => {
		setupTenant();
		const { year, monthName } = getMonthKey(new Date());
		db.seed(`leases/lease-1/payment_history/${year}`, {
			[monthName]: { remainingBalance: 600, transactions: [] }
		});

		const parent = parentFor({ id: 'lease-1', startDate: monthStart() });
		expect((await call(paymentLoad, { userID: 't1', parent })).data.leases[0].balanceCents).toBe(
			60000
		);
	});

	it('Scenario: Unpaid past months carry over since the lease started', async () => {
		setupTenant(2);

		const parent = parentFor({ id: 'lease-1', startDate: monthStart(2) });
		expect((await call(paymentLoad, { userID: 't1', parent })).data.leases[0].balanceCents).toBe(
			300000
		);
	});

	it('Scenario: Ended lease is listed with its unpaid months beside the current lease', async () => {
		setupTenant();
		const ended = {
			id: 'old',
			startDate: monthStart(3),
			endDate: monthEnd(2),
			status: 'ended'
		};
		seedLease('old', {
			propertyId: 'prop-1',
			tenantIds: ['t1'],
			rent: 1000,
			startDate: ended.startDate,
			endDate: ended.endDate
		});

		const result = await call(paymentLoad, {
			userID: 't1',
			parent: parentFor({ id: 'lease-1', startDate: monthStart() }, ended)
		});

		expect(
			result.data.leases.map((l: { id: string; balanceCents: number }) => [l.id, l.balanceCents])
		).toEqual([
			['lease-1', 100000],
			['old', 200000]
		]);
	});

	it('an ended lease that is paid in full is not listed', async () => {
		setupTenant();
		const ended = { id: 'old', startDate: '2020-01-01', endDate: '2020-01-31', status: 'ended' };
		seedLease('old', {
			propertyId: 'prop-1',
			tenantIds: ['t1'],
			startDate: '2020-01-01',
			endDate: '2020-01-31'
		});
		db.seed('leases/old/payment_history/2020', { January: { remainingBalance: 0 } });

		const result = await call(paymentLoad, {
			userID: 't1',
			parent: parentFor({ id: 'lease-1', startDate: monthStart() }, ended)
		});

		expect(result.data.leases.map((l: { id: string }) => l.id)).toEqual(['lease-1']);
	});

	it('Scenario: Upcoming lease only: nothing to pay, so the tenant is sent to the dashboard', async () => {
		setupTenant();
		const result = await call(paymentLoad, {
			userID: 't1',
			parent: parentFor({ id: 'soon', startDate: '2099-01-01', status: 'upcoming' })
		});

		expect(result).toMatchObject({ status: 303, redirect: '/' });
	});

	it('Scenario: Paid in full shows nothing to pay', async () => {
		setupTenant();
		const { year, monthName } = getMonthKey(new Date());
		db.seed(`leases/lease-1/payment_history/${year}`, {
			[monthName]: { remainingBalance: 0, transactions: [] }
		});

		const parent = parentFor({ id: 'lease-1', startDate: monthStart() });
		expect((await call(paymentLoad, { userID: 't1', parent })).data.leases).toMatchObject([
			{ balanceCents: 0, dueDate: null }
		]);
	});

	it('Scenario: an anonymous caller is rejected with 401', async () => {
		expect((await call(paymentLoad, { userID: null })).status).toBe(401);
	});
});

describe('rent-payments: rent, deposit and late fees', () => {
	// 20 November 2026, noon in Indianapolis.
	const NOW = new Date('2026-11-20T17:00:00Z');
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
	});
	afterEach(() => vi.useRealTimers());

	const oct1 = FakeTimestamp.fromMillis(Date.UTC(2026, 9, 1, 17));
	const nov2 = FakeTimestamp.fromMillis(Date.UTC(2026, 10, 2, 17));
	/** lease-1: rent 1500 from 2026-10-01, $1,000 deposit ($500 paid), late fee 75 after 5 days; November short $500. */
	const seedOwing = () => {
		seedTenant('t1', { stripeID: 'cus_t1' });
		seedProperty('prop-1', { streetAddress: '1 Main St', city: 'Terre Haute', state: 'IN' });
		seedLease('lease-1', {
			tenantIds: ['t1'],
			rent: 1500,
			startDate: '2026-10-01',
			deposit: { amount: 1000, dueDate: '2026-10-01' },
			lateFee: 75,
			graceDays: 5,
			lateFeesFrom: '2026-10-01'
		});
		db.seed('leases/lease-1/payment_history/2026', {
			October: { remainingBalance: 0, transactions: [{ date: oct1, amount: 1500 }] },
			November: { remainingBalance: 500, transactions: [{ date: nov2, amount: 1000 }] }
		});
		db.seed('leases/lease-1/deposit/ledger', { paid: 500, transactions: [] });
		// November's late fee, as the daily job charged it on 2026-11-07.
		db.seed('leases/lease-1/late_fees/2026-11', {
			amount: 75,
			paid: 0,
			chargedAt: '2026-11-07T11:00:00.000Z',
			chargedBy: 'daily-job',
			dueDate: '2026-11-07'
		});
	};
	const tenantLease = {
		id: 'lease-1',
		propertyId: 'prop-1',
		address: '1 Main St, Terre Haute',
		rent: 1500,
		startDate: '2026-10-01',
		endDate: null,
		status: 'current',
		hasDocument: false,
		deposit: { amount: 1000, dueDate: '2026-10-01' },
		lateFee: 75,
		graceDays: 5,
		lateFeesFrom: '2026-10-01'
	};

	it('Scenario: Breakdown: /payment shows the total split into late fees, deposit and rent', async () => {
		seedOwing();
		const result = await call(paymentLoad, { userID: 't1', parent: { userLeases: [tenantLease] } });
		expect(result.data.leases[0]).toMatchObject({
			balanceCents: 107500,
			owed: { lateFeesCents: 7500, depositCents: 50000, rentCents: 50000 },
			// The deposit and October are due before the late fee.
			dueDate: '2026-10-01'
		});
	});

	it('Scenario: Split across parts: Late Fee, Security Deposit and Rent lines, fee on the whole amount', async () => {
		seedOwing();

		expect((await pay(600)).status).toBe(200);
		const session = services.stripe.checkout.sessions.create.mock.calls[0][0];
		expect(
			session.line_items.map(
				(l: { price_data: { product_data: { name: string }; unit_amount: number } }) => [
					l.price_data.product_data.name,
					l.price_data.unit_amount
				]
			)
		).toEqual([
			['Late Fee', 7500],
			['Security Deposit', 50000],
			['Rent', 2500],
			['Transaction Fee', 1770]
		]);
		expect(session.invoice_creation.invoice_data.metadata).toMatchObject({
			lateFeeCents: '7500',
			depositCents: '50000',
			rentCents: '2500',
			feeCents: '1770'
		});
		expect((await pay(1075.01)).status).toBe(400);
	});

	it('Scenario: Upcoming lease with a deposit is payable before it starts', async () => {
		seedTenant('t1', { stripeID: 'cus_t1' });
		seedProperty('prop-1');
		seedLease('lease-1', {
			tenantIds: ['t1'],
			rent: 1500,
			startDate: '2026-12-01',
			deposit: { amount: 1000, dueDate: '2026-12-01' },
			lateFee: 75,
			graceDays: 5,
			lateFeesFrom: '2026-11-01'
		});
		const upcoming = {
			...tenantLease,
			startDate: '2026-12-01',
			status: 'upcoming',
			deposit: { amount: 1000, dueDate: '2026-12-01' }
		};

		const result = await call(paymentLoad, { userID: 't1', parent: { userLeases: [upcoming] } });
		expect(result.data.leases[0]).toMatchObject({
			balanceCents: 100000,
			dueDate: '2026-12-01',
			owed: { lateFeesCents: 0, depositCents: 100000, rentCents: 0 }
		});
		expect((await pay(400)).status).toBe(200);
		const [deposit] = services.stripe.checkout.sessions.create.mock.calls[0][0].line_items;
		expect(deposit.price_data.product_data.name).toBe('Security Deposit');
	});

	const invoice = (metadata: Record<string, string>, id = 'in_split') => ({
		type: 'invoice.payment_succeeded',
		data: {
			object: {
				id,
				created: Math.floor(NOW.getTime() / 1000),
				customer: 'cus_t1',
				metadata: { leaseID: 'lease-1', propertyID: 'prop-1', ...metadata },
				lines: { data: [] }
			}
		}
	});
	const send = (event: object) =>
		call(webhook, {
			rawBody: JSON.stringify(event),
			headers: { 'stripe-signature': VALID_STRIPE_SIGNATURE }
		});
	const split = {
		lateFeeCents: '7500',
		depositCents: '50000',
		rentCents: '2500',
		feeCents: '1770'
	};

	it('Scenario: Late fee and deposit parts are recorded separately from rent', async () => {
		seedOwing();

		expect((await send(invoice(split))).status).toBe(200);

		expect(db.peek('leases/lease-1/late_fees/2026-11')).toMatchObject({
			amount: 75,
			paid: 75,
			transactions: [expect.objectContaining({ amount: 75, fee: 17.7, invoiceId: 'in_split' })]
		});
		expect(db.peek('leases/lease-1/deposit/ledger')).toMatchObject({
			paid: 1000,
			transactions: [expect.objectContaining({ amount: 500, invoiceId: 'in_split' })]
		});
		const november = (
			db.peek('leases/lease-1/payment_history/2026') as Record<
				string,
				{ remainingBalance: number; transactions: { amount: number }[] }
			>
		).November;
		expect(november.remainingBalance).toBe(475);
		expect(november.transactions.map((t) => t.amount)).toEqual([1000, 25]);

		const result = await call(paymentLoad, { userID: 't1', parent: { userLeases: [tenantLease] } });
		expect(result.data.leases[0]).toMatchObject({
			balanceCents: 47500,
			owed: { lateFeesCents: 0, depositCents: 0, rentCents: 47500 }
		});
	});

	it('Scenario: Owed amounts changed after checkout: a fee waived meanwhile goes to the deposit and rent', async () => {
		seedOwing();
		db.seed('leases/lease-1/late_fees/2026-11', {
			amount: 75,
			paid: 0,
			waivedAt: '2026-11-19T00:00:00Z',
			waivedBy: 'admin'
		});

		await send(invoice(split));

		expect(db.peek('leases/lease-1/late_fees/2026-11')).toMatchObject({ paid: 0 });
		expect(db.peek('leases/lease-1/deposit/ledger')).toMatchObject({ paid: 1000 });
		const november = (
			db.peek('leases/lease-1/payment_history/2026') as Record<string, { remainingBalance: number }>
		).November;
		expect(november.remainingBalance).toBe(400);
	});

	it('Scenario: Invoice from before this change: the whole amount goes to rent', async () => {
		seedOwing();

		await send(invoice({ rentCents: '60000', feeCents: '1770' }));

		expect(db.peek('leases/lease-1/late_fees/2026-11')).toMatchObject({ paid: 0 });
		expect(db.peek('leases/lease-1/deposit/ledger')).toMatchObject({ paid: 500 });
		const november = (
			db.peek('leases/lease-1/payment_history/2026') as Record<string, { remainingBalance: number }>
		).November;
		expect(november.remainingBalance).toBe(-100);
	});

	it('a legacy entry without transactions keeps its paid amount when a payment is added', async () => {
		seedOwing();
		db.seed('leases/lease-1/payment_history/2026', {
			October: { remainingBalance: 0 },
			November: { remainingBalance: 500 }
		});

		await send(invoice({ rentCents: '50000', feeCents: '1480' }));

		const november = (
			db.peek('leases/lease-1/payment_history/2026') as Record<
				string,
				{ remainingBalance: number; transactions: { amount: number; legacy?: boolean }[] }
			>
		).November;
		expect(november.remainingBalance).toBe(0);
		expect(november.transactions).toEqual([
			{ amount: 1000, legacy: true },
			expect.objectContaining({ amount: 500, fee: 14.8 })
		]);
	});

	it('Scenario: Redelivered split invoice is not counted twice', async () => {
		seedOwing();
		await send(invoice(split));
		await send(invoice(split));
		expect(db.peek('leases/lease-1/deposit/ledger')).toMatchObject({ paid: 1000 });
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toMatchObject({ paid: 75 });
	});
});
