import { describe, expect, it } from 'vitest';
import { POST as waive } from '../../src/routes/api/lease/[leaseId]/late-fees/[month]/waive/+server';
import { PUT as settle } from '../../src/routes/api/lease/[leaseId]/deposit/settlement/+server';
import { call } from '../helpers/callHandler';
import { db, seedAdmin, seedLease, seedProperty, seedTenant } from '../helpers/seed';

// lease-billing: Waive a late fee; security-deposits: Settle a deposit.

/** lease-1: rent 1000 through Jan–Mar 2025, nothing paid, $75 late fee after 5 days, $1,000 deposit paid. */
const setup = (terms: { endDate?: string | null; startDate?: string } = {}) => {
	seedAdmin('admin-1');
	seedTenant('t1');
	seedProperty('prop-1');
	seedLease('lease-1', {
		tenantIds: ['t1'],
		rent: 1000,
		startDate: terms.startDate ?? '2025-01-01',
		endDate: terms.endDate === undefined ? '2025-03-31' : terms.endDate,
		deposit: { amount: 1000, dueDate: '2025-01-01' },
		lateFee: 75,
		graceDays: 5,
		lateFeesFrom: '2025-01-01'
	});
	db.seed('leases/lease-1/deposit/ledger', { paid: 1000, transactions: [] });
};

const waiveAs = (userID: string, month = '2025-02', leaseId = 'lease-1') =>
	call(waive, { userID, method: 'POST', params: { leaseId, month } });
const settleAs = (userID: string, body: unknown, leaseId = 'lease-1') =>
	call(settle, { userID, method: 'PUT', params: { leaseId }, body });

describe('lease-billing: Waive a late fee (POST /api/lease/{id}/late-fees/{month}/waive)', () => {
	it('Scenario: Waive: the unpaid fee is no longer owed and is marked waived', async () => {
		setup();
		const result = await waiveAs('admin-1');
		expect(result.status).toBe(200);
		expect(db.peek('leases/lease-1/late_fees/2025-02')).toMatchObject({
			amount: 75,
			paid: 0,
			waivedBy: 'admin-1',
			waivedAt: expect.any(String)
		});
		// Waiving again changes nothing.
		const before = db.peek('leases/lease-1/late_fees/2025-02');
		expect((await waiveAs('admin-1')).status).toBe(200);
		expect(db.peek('leases/lease-1/late_fees/2025-02')).toEqual(before);
	});

	it('a partly paid fee keeps what was paid', async () => {
		setup();
		db.seed('leases/lease-1/late_fees/2025-02', { amount: 75, paid: 25, transactions: [] });
		await waiveAs('admin-1');
		expect(db.peek('leases/lease-1/late_fees/2025-02')).toMatchObject({ amount: 75, paid: 25 });
	});

	it('Scenario: Tenant tries to waive: 401 and nothing changes', async () => {
		setup();
		expect((await waiveAs('t1')).status).toBe(401);
		expect(db.peek('leases/lease-1/late_fees/2025-02')).toBeUndefined();
	});

	it('a month with no fee charged, a malformed month or an unknown lease responds 404', async () => {
		setup();
		expect((await waiveAs('admin-1', '2025-05')).status).toBe(404);
		expect((await waiveAs('admin-1', 'March')).status).toBe(404);
		expect((await waiveAs('admin-1', '2025-02', 'nope')).status).toBe(404);
		expect(db.peek('leases/lease-1/late_fees/2025-05')).toBeUndefined();
	});
});

describe('security-deposits: Settle a deposit (PUT /api/lease/{id}/deposit/settlement)', () => {
	const carpet = { returned: 800, deductions: [{ amount: 200, reason: 'Carpet cleaning' }] };

	it('Scenario: Settled: stored with who recorded it and when', async () => {
		setup();
		const result = await settleAs('admin-1', carpet);
		expect(result.status).toBe(200);
		expect(db.peek('leases/lease-1/deposit/ledger')).toMatchObject({
			paid: 1000,
			settlement: {
				returned: 800,
				deductions: [{ amount: 200, reason: 'Carpet cleaning' }],
				recordedBy: 'admin-1',
				recordedAt: expect.any(String)
			}
		});
	});

	it('Scenario: Does not add up: 400 and nothing saved', async () => {
		setup();
		const result = await settleAs('admin-1', { returned: 700, deductions: carpet.deductions });
		expect(result.status).toBe(400);
		expect(result.json.errors.total).toBe(
			'Returned and kept must add up to the deposit paid, $1,000.00.'
		);
		expect(db.peek('leases/lease-1/deposit/ledger')).not.toHaveProperty('settlement');
	});

	it('Scenario: Missing reason: 400 naming the deduction', async () => {
		setup();
		const result = await settleAs('admin-1', {
			returned: 800,
			deductions: [{ amount: 200, reason: '  ' }]
		});
		expect(result.status).toBe(400);
		expect(result.json.errors.deductions).toEqual({ 0: 'Each deduction needs a reason.' });
	});

	it('invalid amounts are refused', async () => {
		setup();
		expect((await settleAs('admin-1', { returned: -1, deductions: [] })).status).toBe(400);
		expect(
			(await settleAs('admin-1', { returned: 1000.001, deductions: [] })).json.errors.returned
		).toBeDefined();
		expect(
			(await settleAs('admin-1', { returned: 800, deductions: [{ amount: 0, reason: 'x' }] })).json
				.errors.deductions
		).toBeDefined();
		expect((await settleAs('admin-1', 'nonsense')).status).toBe(400);
	});

	it('Scenario: Lease not ended: 409 and nothing saved', async () => {
		setup({ endDate: null });
		expect((await settleAs('admin-1', carpet)).status).toBe(409);
		expect(db.peek('leases/lease-1/deposit/ledger')).not.toHaveProperty('settlement');
	});

	it('Scenario: Correct a settlement: a new one replaces it', async () => {
		setup();
		await settleAs('admin-1', carpet);
		await settleAs('admin-1', {
			returned: 900,
			deductions: [{ amount: 100, reason: 'Key replacement' }]
		});
		expect(db.peek('leases/lease-1/deposit/ledger')).toMatchObject({
			settlement: { returned: 900, deductions: [{ amount: 100, reason: 'Key replacement' }] }
		});
	});

	it('Scenario: Tenant tries to settle: 401 and nothing changes', async () => {
		setup();
		expect((await settleAs('t1', carpet)).status).toBe(401);
		expect(db.peek('leases/lease-1/deposit/ledger')).not.toHaveProperty('settlement');
	});

	it('a lease with no deposit paid has nothing to settle', async () => {
		setup();
		db.seed('leases/lease-1/deposit/ledger', { paid: 0 });
		const result = await settleAs('admin-1', { returned: 0, deductions: [] });
		expect(result.status).toBe(400);
		expect(result.json.errors.total).toBe('No deposit has been paid on this lease.');
	});
});
