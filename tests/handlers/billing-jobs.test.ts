import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { POST as runJob } from '../../src/routes/api/jobs/daily/+server';
import { call } from '../helpers/callHandler';
import { services } from '../helpers/services';
import { db, seedAdmin, seedLease, seedProperty, seedTenant } from '../helpers/seed';

// billing-jobs: the daily job charges late fees and sends late-fee notices and due-date reminders.

/** `day` at 6:00 in Indianapolis (11:00 UTC in winter, 10:00 in summer; 11:00 is after 6:00 either way). */
const at = (day: string) => new Date(`${day}T11:00:00Z`);
const SECRET = { authorization: 'Bearer jobs-secret-fixture' };

const run = (headers: Record<string, string> = SECRET, userID: string | null = null) =>
	call(runJob, { userID, method: 'POST', headers, body: {} });

const setNow = (day: string) => vi.setSystemTime(at(day));

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

const ts = (day: string) => new Date(`${day}T17:00:00Z`);

/** lease-1: t1 and t2, rent 1500 from 2026-10-01, late fee 75 after 5 days; October paid, November short $500. */
function setup(terms: Record<string, unknown> = {}) {
	seedAdmin('admin-1');
	seedTenant('t1');
	seedTenant('t2');
	seedProperty('prop-1');
	seedLease('lease-1', {
		tenantIds: ['t1', 't2'],
		rent: 1500,
		startDate: '2026-10-01',
		lateFee: 75,
		graceDays: 5,
		lateFeesFrom: '2026-10-01',
		...terms
	});
	db.seed('leases/lease-1/payment_history/2026', {
		October: { remainingBalance: 0, transactions: [{ amount: 1500, date: ts('2026-10-01') }] },
		November: { remainingBalance: 500, transactions: [{ amount: 1000, date: ts('2026-11-02') }] }
	});
}

const emails = () =>
	services.sendEmail.mock.calls.map(([m]) => [m.to, m.subject] as [string, string]);

describe('billing-jobs: Daily run (POST /api/jobs/daily)', () => {
	it('Scenario: Scheduler with the secret: the job runs and summarizes what it did', async () => {
		setup();
		setNow('2026-11-07');
		const result = await run();
		expect(result.status).toBe(200);
		expect(result.json).toMatchObject({ date: '2026-11-07', feesCharged: 1, errors: 0 });
	});

	it('Scenario: Admin runs it on demand', async () => {
		setup();
		setNow('2026-11-07');
		const result = await run({}, 'admin-1');
		expect(result.status).toBe(200);
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toMatchObject({ chargedBy: 'daily-job' });
	});

	it('Scenario: Anyone else: no secret, a wrong secret or a tenant gets 401 and nothing runs', async () => {
		setup();
		setNow('2026-11-07');
		expect((await run({})).status).toBe(401);
		expect((await run({ authorization: 'Bearer nope' })).status).toBe(401);
		expect((await run({ authorization: 'jobs-secret-fixture' })).status).toBe(401);
		expect((await run({}, 't1')).status).toBe(401);
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toBeUndefined();
		expect(services.sendEmail).not.toHaveBeenCalled();
	});
});

describe('billing-jobs: One run at a time, safe to repeat', () => {
	it('Scenario: Overlapping calls: a held lock answers 409', async () => {
		setup();
		setNow('2026-11-07');
		db.seed('_jobs/daily', { lockedUntil: '2026-11-07T11:05:00.000Z' });
		expect((await run()).status).toBe(409);
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toBeUndefined();
	});

	it('an expired lock is taken over, and the lock is released after the run', async () => {
		setup();
		setNow('2026-11-07');
		db.seed('_jobs/daily', { lockedUntil: '2026-11-07T10:00:00.000Z' });
		expect((await run()).status).toBe(200);
		expect(db.peek('_jobs/daily')).toMatchObject({ lockedUntil: null });
	});

	it("a run whose lock was taken over does not release the other run's lock", async () => {
		setup();
		setNow('2026-11-07');
		const realTransaction = db.runTransaction.bind(db);
		let taken = false;
		db.runTransaction = (async (fn: Parameters<typeof db.runTransaction>[0]) => {
			const result = await realTransaction(fn);
			if (!taken && result === true) {
				// Right after this run takes the lock, another run takes it over.
				taken = true;
				db.seed('_jobs/daily', { lockedUntil: '2026-11-07T11:20:00.000Z', lockedBy: 'other' });
			}
			return result;
		}) as typeof db.runTransaction;
		try {
			await run();
		} finally {
			db.runTransaction = realTransaction;
		}
		expect(db.peek('_jobs/daily')).toEqual({
			lockedUntil: '2026-11-07T11:20:00.000Z',
			lockedBy: 'other'
		});
	});

	it('Scenario: Run again the same day: no fee twice, no email twice', async () => {
		setup();
		setNow('2026-11-07');
		await run();
		const fee = db.peek('leases/lease-1/late_fees/2026-11');
		const sent = services.sendEmail.mock.calls.length;
		const again = await run();
		expect(again.json).toMatchObject({ feesCharged: 0, emailsSent: 0 });
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toEqual(fee);
		expect(services.sendEmail.mock.calls.length).toBe(sent);
	});

	it('Scenario: Summary: the day record lists fees charged, emails sent and errors', async () => {
		setup();
		setNow('2026-11-07');
		await run();
		const record = db.peek('_jobs/daily/runs/2026-11-07') as { runs: Record<string, unknown>[] };
		expect(record.runs).toEqual([
			expect.objectContaining({
				date: '2026-11-07',
				runBy: 'scheduler',
				feesCharged: [{ leaseId: 'lease-1', month: '2026-11', amount: 75 }],
				emailsSent: [
					{ leaseId: 'lease-1', notice: 'late-fee-2026-11', to: 't1' },
					{ leaseId: 'lease-1', notice: 'late-fee-2026-11', to: 't2' }
				],
				errors: []
			})
		]);
	});
});

describe('lease-billing: Late fee charged once per late month (by the daily job)', () => {
	it('Scenario: Unpaid after grace: the 2026-11-07 run records a $75.00 fee due 2026-11-07', async () => {
		setup();
		setNow('2026-11-06');
		await run();
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toBeUndefined();

		setNow('2026-11-07');
		await run();
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toEqual({
			amount: 75,
			paid: 0,
			chargedAt: at('2026-11-07').toISOString(),
			chargedBy: 'daily-job',
			dueDate: '2026-11-07'
		});
	});

	it('Scenario: Missed run: a run on 2026-11-09 charges November with its due date 2026-11-07', async () => {
		setup();
		setNow('2026-11-09');
		await run();
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toMatchObject({ dueDate: '2026-11-07' });
	});

	it('Scenario: Paid within grace: no fee', async () => {
		setup();
		db.seed('leases/lease-1/payment_history/2026', {
			October: { transactions: [{ amount: 1500, date: ts('2026-10-01') }] },
			November: { transactions: [{ amount: 1500, date: ts('2026-11-06') }] }
		});
		setNow('2026-11-07');
		await run();
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toBeUndefined();
	});

	it('a lease with no late fee is never charged', async () => {
		setup({ lateFee: 0 });
		setNow('2026-11-07');
		await run();
		expect(db.peek('leases/lease-1/late_fees/2026-11')).toBeUndefined();
	});
});

describe('billing-jobs: Late-fee notice', () => {
	it('Scenario: Fee charged: each tenant gets one late-fee email for November', async () => {
		setup();
		setNow('2026-11-07');
		await run();
		expect(emails()).toEqual([
			['t1@example.com', 'Late fee added for November 2026'],
			['t2@example.com', 'Late fee added for November 2026']
		]);
		const [message] = services.sendEmail.mock.calls[0];
		expect(message.text).toContain('$75.00');
		expect(message.text).toContain('1 Main St, Terre Haute');
		// $500 rent plus the $75 fee.
		expect(message.text).toContain('Your balance is now $575.00');
		expect(message.text).toContain('/payment');
		expect(message.text).toContain('Lehman Family LLC');
		expect(db.peek('leases/lease-1/notices/late-fee-2026-11-t1')).toBeDefined();
	});

	it('Scenario: Email fails: recorded in the summary and sent on the next run; the fee stays charged once', async () => {
		setup();
		setNow('2026-11-07');
		services.sendEmail.mockImplementation(async (m: { to: string }) => {
			if (m.to === 't1@example.com') throw new Error('Email delivery failed: boom');
		});
		const first = await run();
		// Errors answer 500, so Cloud Scheduler retries.
		expect(first.status).toBe(500);
		expect(first.json).toMatchObject({ emailsSent: 1, errors: 1 });
		expect(db.peek('leases/lease-1/notices/late-fee-2026-11-t1')).toBeUndefined();

		services.sendEmail.mockReset().mockResolvedValue(undefined);
		setNow('2026-11-08');
		const second = await run();
		expect(second.json).toMatchObject({ feesCharged: 0, emailsSent: 1, errors: 0 });
		expect(emails()).toEqual([['t1@example.com', 'Late fee added for November 2026']]);
	});

	it('a waived fee is not announced', async () => {
		setup();
		db.seed('leases/lease-1/late_fees/2026-11', {
			amount: 75,
			paid: 0,
			chargedAt: at('2026-11-07').toISOString(),
			dueDate: '2026-11-07',
			waivedAt: '2026-11-07T12:00:00Z'
		});
		setNow('2026-11-08');
		await run();
		expect(emails().filter(([, s]) => s.startsWith('Late fee'))).toEqual([]);
	});
});

describe('billing-jobs: Due-date reminders', () => {
	/** A lease whose October is paid; November falls due 2026-11-01. */
	const paidOctober = () => {
		setup();
		db.seed('leases/lease-1/payment_history/2026', {
			October: { transactions: [{ amount: 1500, date: ts('2026-10-01') }] }
		});
	};

	it('Scenario: Seven days before: each tenant gets one reminder for November', async () => {
		paidOctober();
		setNow('2026-10-24');
		await run();
		expect(emails()).toEqual([]);
		setNow('2026-10-25');
		await run();
		expect(emails()).toEqual([
			['t1@example.com', 'Rent for November 2026 is due on November 1, 2026'],
			['t2@example.com', 'Rent for November 2026 is due on November 1, 2026']
		]);
		expect(services.sendEmail.mock.calls[0][0].text).toContain('$1,500.00 is still to be paid');
		await run();
		expect(services.sendEmail).toHaveBeenCalledTimes(2);
	});

	it('Scenario: On the due day: a due-today reminder', async () => {
		paidOctober();
		setNow('2026-11-01');
		await run();
		expect(emails()).toEqual([
			['t1@example.com', 'Rent for November 2026 is due today'],
			['t2@example.com', 'Rent for November 2026 is due today']
		]);
	});

	it('Scenario: Already paid: no reminder', async () => {
		paidOctober();
		db.seed('leases/lease-1/payment_history/2026', {
			October: { transactions: [{ amount: 1500, date: ts('2026-10-01') }] },
			November: { transactions: [{ amount: 1500, date: ts('2026-10-20') }] }
		});
		setNow('2026-10-25');
		await run();
		setNow('2026-11-01');
		await run();
		expect(emails()).toEqual([]);
	});

	it('Scenario: Deposit due: a reminder 7 days before', async () => {
		setup({ startDate: '2026-11-15', deposit: { amount: 1000, dueDate: '2026-11-15' } });
		db.seed('leases/lease-1/payment_history/2026', {});
		setNow('2026-11-08');
		await run();
		// The prorated first month is payable, and reminded, from the same day.
		expect(emails()).toHaveLength(4);
		expect(emails()).toEqual(
			expect.arrayContaining([
				['t1@example.com', 'Security deposit is due on November 15, 2026'],
				['t2@example.com', 'Security deposit is due on November 15, 2026'],
				['t1@example.com', 'Rent for November 2026 is due on November 15, 2026'],
				['t2@example.com', 'Rent for November 2026 is due on November 15, 2026']
			])
		);
	});

	it('Scenario: Ended lease: no reminders, even for an amount due that day', async () => {
		// The lease ended 2026-10-31 and its unpaid deposit is due 2026-11-08, the run day.
		setup({
			startDate: '2026-10-01',
			endDate: '2026-10-31',
			deposit: { amount: 1000, dueDate: '2026-11-08' }
		});
		setNow('2026-11-08');
		await run();
		expect(emails().filter(([, s]) => !s.startsWith('Late fee'))).toEqual([]);

		// The same deposit on a lease that has not ended is reminded, so the check above matters.
		db.reset();
		services.sendEmail.mockClear();
		setup({ startDate: '2026-10-01', deposit: { amount: 1000, dueDate: '2026-11-08' } });
		await run();
		expect(emails()).toContainEqual(['t1@example.com', 'Security deposit is due today']);
	});

	it('a reminder for a day with no run is not sent later', async () => {
		paidOctober();
		setNow('2026-10-26');
		await run();
		setNow('2026-11-02');
		await run();
		expect(emails()).toEqual([]);
	});

	it('a claim never sent (its run died) is sent once it is older than the lock', async () => {
		paidOctober();
		db.seed('leases/lease-1/notices/rent-7d-2026-11-t1', {
			notice: 'rent-7d-2026-11',
			uid: 't1',
			claimedAt: '2026-10-25T10:00:00.000Z'
		});
		setNow('2026-10-25');
		await run();
		expect(emails()).toHaveLength(2);
		expect(db.peek('leases/lease-1/notices/rent-7d-2026-11-t1')).toMatchObject({
			sentAt: expect.any(String)
		});
	});

	it('a tenant with no email address is a warning, not an error', async () => {
		paidOctober();
		db.seed('users/t2', { firstName: 'No', lastName: 'Email', permissions: 'user' });
		setNow('2026-10-25');
		const result = await run();
		expect(result.status).toBe(200);
		expect(emails()).toEqual([
			['t1@example.com', 'Rent for November 2026 is due on November 1, 2026']
		]);
		const record = db.peek('_jobs/daily/runs/2026-10-25') as { runs: { warnings: string[] }[] };
		expect(record.runs[0].warnings).toEqual(['lease lease-1: tenant t2 has no email address']);
	});

	it('a lease deleted after its fees were charged gets no emails', async () => {
		setup();
		setNow('2026-11-07');
		const realTransaction = db.runTransaction.bind(db);
		db.runTransaction = (async (fn: Parameters<typeof db.runTransaction>[0]) => {
			const result = await realTransaction(fn);
			// An admin deletes the lease right after the job's charge transaction for it.
			if (result && typeof result === 'object' && 'charged' in result) {
				await db.doc('leases/lease-1').delete();
			}
			return result;
		}) as typeof db.runTransaction;
		try {
			await run();
		} finally {
			db.runTransaction = realTransaction;
		}
		expect(services.sendEmail).not.toHaveBeenCalled();
	});

	it('a notice another run already claimed is not sent again', async () => {
		paidOctober();
		db.seed('leases/lease-1/notices/rent-7d-2026-11-t1', {
			notice: 'rent-7d-2026-11',
			uid: 't1',
			claimedAt: '2026-10-25T11:00:00.000Z'
		});
		setNow('2026-10-25');
		await run();
		expect(emails()).toEqual([
			['t2@example.com', 'Rent for November 2026 is due on November 1, 2026']
		]);
	});
});
