import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { POST as startPayment } from '../../src/routes/api/stripe/create-checkout-session/payment/+server';
import { GET as openPortal } from '../../src/routes/api/stripe/create-customer-portal/+server';
import { POST as webhook } from '../../src/routes/api/stripe/webhook/+server';
import { FakeDocRef, FakeTimestamp } from '../helpers/fakeFirestore';
import { getMonthKey } from '../../src/lib/server/payments';
import { load as paymentLoad } from '../../src/routes/(authenticated)/payment/+page.server';
import { call } from '../helpers/callHandler';
import { VALID_STRIPE_SIGNATURE, services } from '../helpers/services';
import { db, linkTenant, seedProperty, seedTenant } from '../helpers/seed';

const setupTenant = () => {
	seedTenant('t1', { stripeID: 'cus_t1' });
	seedProperty('prop-1', {
		streetAddress: '1 Main St',
		city: 'Terre Haute',
		state: 'IN',
		rent: 1000
	});
	linkTenant('t1', 'prop-1');
};

describe('rent-payments: start a payment (POST /api/stripe/create-checkout-session/payment)', () => {
	it('Scenario: Valid amount creates a session with a Rent line, a 2.9% + $0.30 fee line and the property metadata', async () => {
		setupTenant();

		const result = await call(startPayment, { userID: 't1', body: { amount: 1000 } });

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
		// $1000 * 2.9% + $0.30 = $29.30
		expect(fee.price_data.unit_amount).toBe(2930);
		expect(session.invoice_creation.invoice_data.metadata).toEqual({
			propertyID: 'prop-1',
			rentCents: '100000',
			feeCents: '2930'
		});
		expect(session.success_url).toBe(`${PUBLIC_FRONTEND_URL}/payment/success`);
		expect(session.cancel_url).toBe(`${PUBLIC_FRONTEND_URL}/payment`);
	});

	it('Scenario: the fee is rounded to whole cents', async () => {
		setupTenant();

		await call(startPayment, { userID: 't1', body: { amount: 333 } });

		const [, fee] = services.stripe.checkout.sessions.create.mock.calls[0][0].line_items;
		// 33300 * 0.029 + 30 = 995.7 cents -> 996
		expect(fee.price_data.unit_amount).toBe(996);
	});

	it('Scenario: an amount above the balance responds 400 and creates no session', async () => {
		setupTenant();

		const result = await call(startPayment, { userID: 't1', body: { amount: 1000.01 } });

		expect(result).toMatchObject({ status: 400, error: 'Amount is greater than the balance owed' });
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('Scenario: the cap shrinks with payments already made this month', async () => {
		setupTenant();
		const { year, monthName } = getMonthKey(new Date());
		db.seed(`properties/prop-1/payment_history/${year}`, {
			[monthName]: { remainingBalance: 600, transactions: [] }
		});

		expect((await call(startPayment, { userID: 't1', body: { amount: 600.01 } })).status).toBe(400);
		expect((await call(startPayment, { userID: 't1', body: { amount: 600 } })).status).toBe(200);
	});

	it('Scenario: unpaid past months from moveInMonth raise the cap', async () => {
		seedTenant('t1', { stripeID: 'cus_t1' });
		seedProperty('prop-1', { rent: 1000 });
		const current = getMonthKey(new Date());
		const start = getMonthKey(new Date(Date.UTC(current.year, current.month - 3, 15)));
		db.seed('junction_user_property/t1_prop-1', {
			tenantId: 't1',
			propertyId: 'prop-1',
			moveInMonth: start.key
		});

		expect((await call(startPayment, { userID: 't1', body: { amount: 3000.01 } })).status).toBe(
			400
		);
		expect((await call(startPayment, { userID: 't1', body: { amount: 3000 } })).status).toBe(200);
	});

	it('Scenario: negative or fractional-cent amounts respond 400 and create no session', async () => {
		setupTenant();

		for (const amount of [-5, 10.005, 0.001]) {
			expect((await call(startPayment, { userID: 't1', body: { amount } })).status).toBe(400);
		}
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('Scenario: amounts are rounded to whole cents for Stripe', async () => {
		setupTenant();

		await call(startPayment, { userID: 't1', body: { amount: 19.99 } });

		const [rent] = services.stripe.checkout.sessions.create.mock.calls[0][0].line_items;
		expect(rent.price_data.unit_amount).toBe(1999);
	});

	it('Scenario: Invalid amount (missing, zero or not a number) responds 400 and creates no session', async () => {
		setupTenant();

		for (const body of [{}, { amount: 0 }, { amount: '50' }, { amount: null }]) {
			const result = await call(startPayment, { userID: 't1', body });
			expect(result.status).toBe(400);
			expect(result.error).toBe('Amount must be a provided number for the amount to charge');
		}
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('Scenario: a tenant without exactly one property responds 500 and creates no session', async () => {
		seedTenant('t1');

		const result = await call(startPayment, { userID: 't1', body: { amount: 100 } });

		expect(result).toMatchObject({
			status: 500,
			error: 'User is associated with wrong number of properties: 0'
		});
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('Scenario: a session without a URL responds 500', async () => {
		setupTenant();
		services.stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: null });

		const result = await call(startPayment, { userID: 't1', body: { amount: 100 } });

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

	const invoiceEvent = (
		lines: { description: string; amount: number }[],
		propertyID = 'prop-1'
	) => ({
		type: 'invoice.payment_succeeded',
		data: { object: { created, metadata: { propertyID }, lines: { data: lines } } }
	});
	const send = (event: object, signature: string | null = VALID_STRIPE_SIGNATURE) =>
		call(webhook, {
			rawBody: JSON.stringify(event),
			headers: signature ? { 'stripe-signature': signature } : {}
		});
	const history = () => db.peek('properties/prop-1/payment_history/2026');

	it('Scenario: First payment of the month sets remainingBalance to rent minus the amount and appends the transaction', async () => {
		seedProperty('prop-1', { rent: 1000 });

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
		seedProperty('prop-1', { rent: 1000 });
		const earlier = { date: FakeTimestamp.fromMillis(created * 1000 - 86_400_000), amount: 400 };
		db.seed('properties/prop-1/payment_history/2026', {
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
		seedProperty('prop-1', { rent: 1000 });
		db.seed('properties/prop-1/payment_history/2026', {
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
		seedProperty('prop-1', { rent: 1000 });
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
		seedProperty('prop-1', { rent: 1000 });

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
		seedProperty('prop-1', { rent: 1000 });
		// 23:30 on 31 March in Indianapolis (EDT) is 03:30 UTC on 1 April.
		const late = Date.UTC(2026, 3, 1, 3, 30, 0) / 1000;
		const event = invoiceEvent([{ description: 'Rent', amount: 10000 }]);
		event.data.object.created = late;

		await send(event);

		expect(history()).toHaveProperty('March');
		expect(history()).not.toHaveProperty('April');
	});

	it('Scenario: a failed Firestore write responds 500 so Stripe retries', async () => {
		seedProperty('prop-1', { rent: 1000 });
		const failing = vi.spyOn(FakeDocRef.prototype, 'set').mockRejectedValue(new Error('boom'));

		const result = await send(invoiceEvent([{ description: 'Rent', amount: 10000 }]));

		failing.mockRestore();
		expect(result.status).toBe(500);
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

	it('Scenario: an invoice for a property that does not exist is acknowledged and records nothing', async () => {
		const result = await send(
			invoiceEvent([{ description: 'Rent', amount: 100000 }], 'missing-property')
		);

		expect(result.status).toBe(200);
		expect(db.peek('properties/missing-property/payment_history/2026')).toBeUndefined();
	});
});

describe('rent-payments: balance and due date (/payment load)', () => {
	const parent = { userProperty: { id: 'prop-1', data: { rent: 1000 } } };

	it('Scenario: no payments yet shows the rent due on the 1st of this month', async () => {
		setupTenant();

		const result = await call(paymentLoad, { userID: 't1', parent });

		const current = getMonthKey(new Date());
		expect(result.data).toEqual({ balanceCents: 100000, dueDate: `${current.key}-01` });
	});

	it('Scenario: a partial payment lowers the balance', async () => {
		setupTenant();
		const { year, monthName } = getMonthKey(new Date());
		db.seed(`properties/prop-1/payment_history/${year}`, {
			[monthName]: { remainingBalance: 600, transactions: [] }
		});

		expect((await call(paymentLoad, { userID: 't1', parent })).data.balanceCents).toBe(60000);
	});

	it('Scenario: months since moveInMonth carry over', async () => {
		seedTenant('t1');
		seedProperty('prop-1', { rent: 1000 });
		const current = getMonthKey(new Date());
		const start = getMonthKey(new Date(Date.UTC(current.year, current.month - 3, 15)));
		db.seed('junction_user_property/t1_prop-1', {
			tenantId: 't1',
			propertyId: 'prop-1',
			moveInMonth: start.key
		});

		expect((await call(paymentLoad, { userID: 't1', parent })).data.balanceCents).toBe(300000);
	});

	it('Scenario: paid in full shows nothing to pay', async () => {
		setupTenant();
		const { year, monthName } = getMonthKey(new Date());
		db.seed(`properties/prop-1/payment_history/${year}`, {
			[monthName]: { remainingBalance: 0, transactions: [] }
		});

		expect((await call(paymentLoad, { userID: 't1', parent })).data).toEqual({
			balanceCents: 0,
			dueDate: null
		});
	});

	it('Scenario: without a property in the layout data the page fails with 500', async () => {
		seedTenant('t1');

		expect((await call(paymentLoad, { userID: 't1' })).status).toBe(500);
	});

	it('Scenario: an anonymous caller is rejected with 401', async () => {
		expect((await call(paymentLoad, { userID: null })).status).toBe(401);
	});
});
