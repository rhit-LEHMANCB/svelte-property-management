import { describe, expect, it } from 'vitest';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { POST as setup } from '../../src/routes/api/autopay/setup/+server';
import { POST as complete } from '../../src/routes/api/autopay/complete/+server';
import { DELETE as turnOff, PATCH as change } from '../../src/routes/api/autopay/+server';
import { load as paymentLoad } from '../../src/routes/(authenticated)/payment/+page.server';
import { listPropertyLeases } from '../../src/lib/server/leases';
import { call } from '../helpers/callHandler';
import { services } from '../helpers/services';
import { db, seedLease, seedProperty, seedTenant } from '../helpers/seed';

// autopay: saving a payment method, enrolling, changing the amount and turning autopay off.

function setupLease() {
	seedTenant('t1');
	seedTenant('t2');
	seedTenant('t3');
	seedProperty('prop-1');
	seedLease('lease-1', { tenantIds: ['t1', 't2'], rent: 1000, startDate: '2026-01-01' });
}

const start = (body: unknown, userID: string | null = 't1') => call(setup, { userID, body });

/** A completed setup session as Stripe returns it, with the saved method expanded. */
const session = (
	overrides: Record<string, unknown> = {},
	method: Record<string, unknown> = {}
) => ({
	id: 'cs_test_1',
	mode: 'setup',
	status: 'complete',
	customer: 'cus_t1',
	metadata: { leaseID: 'lease-1', propertyID: 'prop-1', uid: 't1', amountCents: '50000' },
	setup_intent: {
		id: 'seti_1',
		status: 'succeeded',
		payment_method: {
			id: 'pm_card_1',
			type: 'card',
			card: { brand: 'visa', last4: '4242' },
			...method
		}
	},
	...overrides
});

const finish = (userID: string | null = 't1', sessionId = 'cs_test_1') =>
	call(complete, { userID, body: { sessionId } });

describe('autopay: Save a payment method and enroll', () => {
	it('Scenario: Start setup: a setup-mode Checkout session for card and bank account', async () => {
		setupLease();
		const result = await start({ leaseId: 'lease-1', amount: 500 });

		expect(result).toMatchObject({ status: 200, json: { url: 'https://checkout.test/session' } });
		const args = services.stripe.checkout.sessions.create.mock.calls[0][0];
		expect(args).toMatchObject({
			mode: 'setup',
			customer: 'cus_t1',
			currency: 'usd',
			payment_method_types: ['card', 'us_bank_account'],
			metadata: { leaseID: 'lease-1', propertyID: 'prop-1', uid: 't1', amountCents: '50000' },
			success_url: `${PUBLIC_FRONTEND_URL}/payment?autopay_session={CHECKOUT_SESSION_ID}`,
			cancel_url: `${PUBLIC_FRONTEND_URL}/payment`
		});
	});

	it('an account without ACH Direct Debit gets a card-only setup; other errors are not retried', async () => {
		setupLease();
		services.stripe.checkout.sessions.create.mockRejectedValueOnce(
			Object.assign(new Error('The payment method type "us_bank_account" is invalid.'), {
				param: 'payment_method_types'
			})
		);
		const result = await start({ leaseId: 'lease-1' });
		expect(result.status).toBe(200);
		const calls = services.stripe.checkout.sessions.create.mock.calls;
		expect(calls.map(([args]) => args.payment_method_types)).toEqual([
			['card', 'us_bank_account'],
			['card']
		]);

		services.stripe.checkout.sessions.create.mockReset();
		services.stripe.checkout.sessions.create.mockRejectedValueOnce(new Error('Stripe is down'));
		await expect(start({ leaseId: 'lease-1' })).rejects.toThrow('Stripe is down');
		expect(services.stripe.checkout.sessions.create).toHaveBeenCalledOnce();
	});

	it('no amount means the full balance', async () => {
		setupLease();
		await start({ leaseId: 'lease-1' });
		await start({ leaseId: 'lease-1', amount: null });
		for (const [args] of services.stripe.checkout.sessions.create.mock.calls) {
			expect(args.metadata.amountCents).toBe('');
		}
	});

	it('Scenario: Not the tenant’s lease or bad amount: 403 or 400, and no session', async () => {
		setupLease();
		expect((await start({ leaseId: 'lease-1' }, 't3')).status).toBe(403);
		expect((await start({ leaseId: 'nope' })).status).toBe(403);
		expect((await start({})).status).toBe(403);
		expect((await start({ leaseId: 'lease-1', amount: 0 })).status).toBe(400);
		expect((await start({ leaseId: 'lease-1', amount: -5 })).status).toBe(400);
		expect((await start({ leaseId: 'lease-1', amount: 10.005 })).status).toBe(400);
		expect((await start({ leaseId: 'lease-1', amount: '500' })).status).toBe(400);
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('Scenario: Complete enrollment: saved with display details only in the response', async () => {
		setupLease();
		services.stripe.checkout.sessions.retrieve.mockResolvedValue(session());

		const result = await finish();

		expect(result.status).toBe(200);
		expect(services.stripe.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_test_1', {
			expand: ['setup_intent.payment_method']
		});
		expect(result.json).toEqual({
			leaseId: 'lease-1',
			enrollment: {
				type: 'card',
				brand: 'visa',
				last4: '4242',
				method: 'Visa ending 4242',
				amountCents: 50000,
				enrolledAt: expect.any(String)
			}
		});
		expect(JSON.stringify(result.json)).not.toContain('pm_card_1');
		expect(db.peek('leases/lease-1/autopay/t1')).toMatchObject({
			paymentMethodId: 'pm_card_1',
			type: 'card',
			brand: 'visa',
			last4: '4242',
			amountCents: 50000,
			setupSessionId: 'cs_test_1'
		});
	});

	it('a bank account is saved with its bank name and last four digits', async () => {
		setupLease();
		services.stripe.checkout.sessions.retrieve.mockResolvedValue(
			session(
				{ metadata: { leaseID: 'lease-1', uid: 't1', amountCents: '' } },
				{
					id: 'pm_bank_1',
					type: 'us_bank_account',
					card: undefined,
					us_bank_account: { bank_name: 'STRIPE TEST BANK', last4: '6789' }
				}
			)
		);
		const result = await finish();
		expect(result.json.enrollment).toMatchObject({
			method: 'Bank account ending 6789',
			amountCents: null
		});
		expect(db.peek('leases/lease-1/autopay/t1')).toMatchObject({
			paymentMethodId: 'pm_bank_1',
			type: 'us_bank_account'
		});
	});

	it('Scenario: Someone else’s or unfinished session: nothing is saved', async () => {
		setupLease();
		services.stripe.checkout.sessions.retrieve.mockResolvedValue(session());
		// Started by t1, completed by t2 (who is on the same lease).
		expect((await finish('t2')).status).toBe(403);

		services.stripe.checkout.sessions.retrieve.mockResolvedValue(
			session({ metadata: { leaseID: 'lease-1', uid: 't3' } })
		);
		expect((await finish('t3')).status).toBe(403);

		services.stripe.checkout.sessions.retrieve.mockResolvedValue(
			session({ status: 'open', setup_intent: null })
		);
		expect((await finish()).status).toBe(400);

		services.stripe.checkout.sessions.retrieve.mockResolvedValue(session({ mode: 'payment' }));
		expect((await finish()).status).toBe(403);

		services.stripe.checkout.sessions.retrieve.mockResolvedValue(
			session({ customer: 'cus_someone_else' })
		);
		expect((await finish()).status).toBe(403);

		services.stripe.checkout.sessions.retrieve.mockRejectedValue(new Error('No such session'));
		expect((await finish()).status).toBe(400);
		expect((await finish('t1', 'not a session')).status).toBe(400);

		expect(db.peek('leases/lease-1/autopay/t1')).toBeUndefined();
		expect(db.peek('leases/lease-1/autopay/t2')).toBeUndefined();
	});

	it('Scenario: Completing twice: the enrollment is unchanged, including its enrollment time', async () => {
		setupLease();
		services.stripe.checkout.sessions.retrieve.mockResolvedValue(session());
		await finish();
		const first = db.peek('leases/lease-1/autopay/t1');
		await new Promise((r) => setTimeout(r, 5));
		const again = await finish();
		expect(again.status).toBe(200);
		expect(db.peek('leases/lease-1/autopay/t1')).toEqual(first);
	});

	it('re-enrolling with a new method keeps the original place in the charge order', async () => {
		setupLease();
		db.seed('leases/lease-1/autopay/t1', {
			paymentMethodId: 'pm_old',
			type: 'card',
			brand: 'visa',
			last4: '1111',
			amountCents: null,
			enrolledAt: '2026-02-01T00:00:00.000Z',
			setupSessionId: 'cs_old'
		});
		services.stripe.checkout.sessions.retrieve.mockResolvedValue(session());
		await finish();
		expect(db.peek('leases/lease-1/autopay/t1')).toMatchObject({
			paymentMethodId: 'pm_card_1',
			last4: '4242',
			enrolledAt: '2026-02-01T00:00:00.000Z'
		});
	});
});

const enroll = (uid: string, amountCents: number | null = null) =>
	db.seed(`leases/lease-1/autopay/${uid}`, {
		paymentMethodId: `pm_${uid}`,
		type: 'card',
		brand: 'visa',
		last4: '4242',
		amountCents,
		enrolledAt: '2026-02-01T00:00:00.000Z'
	});

describe('autopay: Change or end autopay', () => {
	it('Scenario: Change amount: a new amount, or null for the full balance', async () => {
		setupLease();
		enroll('t1');
		const result = await call(change, {
			userID: 't1',
			method: 'PATCH',
			body: { leaseId: 'lease-1', amount: 250.5 }
		});
		expect(result).toMatchObject({ status: 200, json: { enrollment: { amountCents: 25050 } } });
		expect(db.peek('leases/lease-1/autopay/t1')).toMatchObject({ amountCents: 25050 });
		expect(JSON.stringify(result.json)).not.toContain('pm_t1');

		await call(change, {
			userID: 't1',
			method: 'PATCH',
			body: { leaseId: 'lease-1', amount: null }
		});
		expect(db.peek('leases/lease-1/autopay/t1')).toMatchObject({ amountCents: null });
	});

	it('a bad amount is 400 and nothing changes', async () => {
		setupLease();
		enroll('t1', 10000);
		for (const body of [{ leaseId: 'lease-1', amount: 0 }, { leaseId: 'lease-1' }]) {
			const result = await call(change, { userID: 't1', method: 'PATCH', body });
			expect(result.status).toBe(400);
		}
		expect(db.peek('leases/lease-1/autopay/t1')).toMatchObject({ amountCents: 10000 });
	});

	it('Scenario: Turn off: the enrollment is removed; pending charges stay recorded', async () => {
		setupLease();
		enroll('t1');
		enroll('t2');
		db.seed('leases/lease-1/autopay_charges/2026-03-01_t1', { uid: 't1', state: 'pending' });
		const result = await call(turnOff, {
			userID: 't1',
			method: 'DELETE',
			body: { leaseId: 'lease-1' }
		});
		expect(result.status).toBe(204);
		expect(db.peek('leases/lease-1/autopay/t1')).toBeUndefined();
		expect(db.peek('leases/lease-1/autopay/t2')).toBeDefined();
		expect(db.peek('leases/lease-1/autopay_charges/2026-03-01_t1')).toMatchObject({
			state: 'pending'
		});
	});

	it('Scenario: Only your own: 403 for another lease, 404 with no enrollment', async () => {
		setupLease();
		enroll('t2');
		const patch = (userID: string, leaseId: string) =>
			call(change, { userID, method: 'PATCH', body: { leaseId, amount: 5 } });
		const del = (userID: string, leaseId: string) =>
			call(turnOff, { userID, method: 'DELETE', body: { leaseId } });
		expect((await patch('t3', 'lease-1')).status).toBe(403);
		expect((await del('t3', 'lease-1')).status).toBe(403);
		expect((await patch('t1', 'lease-1')).status).toBe(404);
		expect((await del('t1', 'lease-1')).status).toBe(404);
		expect(db.peek('leases/lease-1/autopay/t2')).toMatchObject({ amountCents: null });
	});
});

describe('autopay: Access', () => {
	it('Scenario: Not signed in: every autopay route answers 401', async () => {
		setupLease();
		expect((await start({ leaseId: 'lease-1' }, null)).status).toBe(401);
		expect((await finish(null)).status).toBe(401);
		expect(
			(
				await call(change, {
					userID: null,
					method: 'PATCH',
					body: { leaseId: 'lease-1', amount: 5 }
				})
			).status
		).toBe(401);
		expect(
			(await call(turnOff, { userID: null, method: 'DELETE', body: { leaseId: 'lease-1' } })).status
		).toBe(401);
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});
});

describe('autopay: Tenant autopay controls (payment page data)', () => {
	const parent = {
		userLeases: [
			{
				id: 'lease-1',
				propertyId: 'prop-1',
				address: '1 Main St, Terre Haute',
				rent: 1000,
				startDate: '2026-01-01',
				endDate: null,
				status: 'current',
				hasDocument: false
			}
		]
	};

	it('Scenario: Another tenant’s data: the page shows only the caller’s enrollment and charges', async () => {
		setupLease();
		enroll('t1', 30000);
		enroll('t2');
		db.seed('leases/lease-1/autopay_charges/2026-03-01_t2', {
			uid: 't2',
			cycleKey: '2026-03-01',
			state: 'failed',
			attempts: 1,
			lastAttemptDay: '2026-03-01',
			claimedAt: '2026-03-01T11:00:00.000Z',
			amountCents: 70000,
			feeCents: 2060
		});

		const own = (await call(paymentLoad, { userID: 't1', parent })).data.leases[0].autopay;
		expect(own).toEqual({
			enrollment: {
				type: 'card',
				brand: 'visa',
				last4: '4242',
				method: 'Visa ending 4242',
				amountCents: 30000,
				enrolledAt: '2026-02-01T00:00:00.000Z'
			},
			charge: null
		});

		const other = (await call(paymentLoad, { userID: 't2', parent })).data.leases[0].autopay;
		expect(other.enrollment.amountCents).toBeNull();
		expect(other.charge).toMatchObject({ state: 'failed', day: '2026-03-01', amountCents: 70000 });
		expect(JSON.stringify(other)).not.toContain('pm_');
	});

	it('Scenario: Not enrolled: no enrollment and no charge', async () => {
		setupLease();
		const data = (await call(paymentLoad, { userID: 't1', parent })).data.leases[0].autopay;
		expect(data).toEqual({ enrollment: null, charge: null });
	});
});

describe('autopay: Admin visibility', () => {
	it('Scenario: Lease list: enrolled tenants with method and amount, and a failed charge with its date', async () => {
		setupLease();
		seedLease('lease-2', {
			tenantIds: ['t3'],
			rent: 800,
			startDate: '2025-01-01',
			endDate: '2025-12-31'
		});
		enroll('t1', 30000);
		enroll('t2');
		// A former tenant's enrollment is not listed.
		enroll('gone');
		db.seed('leases/lease-1/autopay_charges/2026-03-01_t2', {
			uid: 't2',
			cycleKey: '2026-03-01',
			state: 'failed',
			attempts: 2,
			lastAttemptDay: '2026-03-02',
			claimedAt: '2026-03-02T11:00:00.000Z',
			amountCents: 70000,
			feeCents: 2060
		});

		const leases = await listPropertyLeases('prop-1', new Date('2026-03-12T17:00:00Z'));
		const lease1 = leases.find((l) => l.id === 'lease-1')!;
		expect(lease1.autopay).toEqual([
			{ tenantId: 't1', name: 'Tom Tenant', method: 'Visa ending 4242', amountCents: 30000 },
			{ tenantId: 't2', name: 'Tom Tenant', method: 'Visa ending 4242', amountCents: null }
		]);
		expect(lease1.autopayStatus).toEqual({
			state: 'failed',
			name: 'Tom Tenant',
			day: '2026-03-02',
			amountCents: 70000,
			attempts: 2
		});
		expect(JSON.stringify(lease1)).not.toContain('pm_');
		const lease2 = leases.find((l) => l.id === 'lease-2')!;
		expect(lease2.autopay).toEqual([]);
		expect(lease2.autopayStatus).toBeNull();
	});

	it('a charge that succeeded is not shown as a status', async () => {
		setupLease();
		db.seed('leases/lease-1/autopay_charges/2026-03-01_t1', {
			uid: 't1',
			cycleKey: '2026-03-01',
			state: 'succeeded',
			attempts: 1,
			lastAttemptDay: '2026-03-01',
			claimedAt: '2026-03-01T11:00:00.000Z',
			amountCents: 100000,
			feeCents: 0
		});
		const [lease] = await listPropertyLeases('prop-1');
		expect(lease.autopayStatus).toBeNull();
	});
});

describe('autopay: review fixes (enrollment input)', () => {
	it('an older setup session completed later does not undo a newer enrollment or amount', async () => {
		setupLease();
		// Session B (new card) was completed, then the amount was changed after both sessions.
		db.seed('leases/lease-1/autopay/t1', {
			paymentMethodId: 'pm_new',
			type: 'card',
			brand: 'visa',
			last4: '9999',
			amountCents: 20000,
			enrolledAt: '2026-02-01T00:00:00.000Z',
			setupSessionId: 'cs_test_b',
			updatedAt: '2026-03-05T00:00:00.000Z'
		});
		// Session A was created before that.
		services.stripe.checkout.sessions.retrieve.mockResolvedValue(
			session({ id: 'cs_test_a', created: Date.parse('2026-03-01T00:00:00Z') / 1000 })
		);
		const result = await finish('t1', 'cs_test_a');
		expect(result.status).toBe(200);
		expect(db.peek('leases/lease-1/autopay/t1')).toMatchObject({
			paymentMethodId: 'pm_new',
			amountCents: 20000
		});

		// A session created after the last change does replace the method.
		services.stripe.checkout.sessions.retrieve.mockResolvedValue(
			session({ id: 'cs_test_c', created: Date.parse('2026-03-06T00:00:00Z') / 1000 })
		);
		await finish('t1', 'cs_test_c');
		expect(db.peek('leases/lease-1/autopay/t1')).toMatchObject({ paymentMethodId: 'pm_card_1' });
	});

	it('a lease id that is not a single path segment is 403, not a server error', async () => {
		setupLease();
		db.seed('leases/lease-1/autopay/t1', { amountCents: null });
		for (const leaseId of ['a/b', 'lease-1/autopay/t1', '', 42, null]) {
			expect((await start({ leaseId })).status).toBe(403);
			const patch = await call(change, {
				userID: 't1',
				method: 'PATCH',
				body: { leaseId, amount: 5 }
			});
			expect(patch.status).toBe(403);
		}
		expect(services.stripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('a body that is not JSON gets the usual 403 or 400, not a server error', async () => {
		setupLease();
		const raw = (handler: typeof setup | typeof complete) =>
			call(handler, {
				userID: 't1',
				rawBody: 'not json',
				headers: { 'content-type': 'text/plain' }
			});
		expect((await raw(setup)).status).toBe(403);
		expect((await raw(complete)).status).toBe(400);
	});
});
