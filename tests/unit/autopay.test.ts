import { describe, expect, it } from 'vitest';
import {
	autopayFeeCents,
	byEnrollmentOrder,
	dueNow,
	methodLabel,
	parseAmountCents,
	planAutopay,
	projectedSplit,
	publicEnrollment,
	type ChargeRecord,
	type Enrollment
} from '../../src/lib/server/autopay';
import { computeLedger, type HistoryYear, type LeaseTerms } from '../../src/lib/server/billing';

/** Noon in Indianapolis on `day`. */
const on = (day: string) => new Date(`${day}T16:00:00Z`);

const lease = (terms: Partial<LeaseTerms> = {}): LeaseTerms => ({
	rent: 1000,
	startDate: '2026-11-01',
	endDate: null,
	deposit: null,
	lateFee: 50,
	graceDays: 5,
	lateFeesFrom: '2026-01-01',
	...terms
});

const ledgerOn = (
	day: string,
	terms: Partial<LeaseTerms> = {},
	histories: Record<string, HistoryYear> = {}
) => computeLedger({ lease: lease(terms), histories, now: on(day) });

const enrolled = (
	uid: string,
	amountCents: number | null = null,
	at = '2026-10-01'
): Enrollment => ({
	uid,
	paymentMethodId: `pm_${uid}`,
	type: 'card',
	brand: 'visa',
	last4: '4242',
	amountCents,
	enrolledAt: `${at}T00:00:00.000Z`
});

const charge = (uid: string, extra: Partial<ChargeRecord>): ChargeRecord => ({
	uid,
	cycleKey: '2026-11-01',
	state: 'failed',
	attempts: 1,
	lastAttemptDay: '2026-11-01',
	claimedAt: '2026-11-01T11:00:00.000Z',
	amountCents: 100000,
	feeCents: 0,
	...extra
});

const plan = (
	day: string,
	enrollments: Enrollment[],
	charges: ChargeRecord[] = [],
	terms: Partial<LeaseTerms> = {},
	histories: Record<string, HistoryYear> = {}
) =>
	planAutopay({
		ledger: ledgerOn(day, terms, histories),
		enrollments,
		charges,
		today: day,
		tenantIds: enrollments.map((e) => e.uid)
	});

describe('autopay: Transaction fee by payment method', () => {
	it('Scenario: Card: 2.9% plus $0.30, rounded to whole cents', () => {
		expect(autopayFeeCents('card', 100000)).toBe(2930);
		expect(autopayFeeCents('card', 33300)).toBe(996);
	});

	it('Scenario: Bank account: no fee', () => {
		expect(autopayFeeCents('us_bank_account', 100000)).toBe(0);
	});
});

describe('autopay: Autopay charge in the daily job (planning)', () => {
	it('Scenario: Charge on the due date: the one enrolled tenant is charged what is owed', () => {
		expect(plan('2026-11-01', [enrolled('t1')])).toEqual({
			cycleKey: '2026-11-01',
			charges: [{ uid: 't1', attempt: 1, amountCents: 100000 }]
		});
	});

	it('Scenario: Amount cap and next tenant: $300 then $700', () => {
		const result = plan('2026-11-01', [enrolled('t2', null, '2026-10-02'), enrolled('t1', 30000)]);
		expect(result.charges).toEqual([
			{ uid: 't1', attempt: 1, amountCents: 30000 },
			{ uid: 't2', attempt: 1, amountCents: 70000 }
		]);
	});

	it('Scenario: Never above the balance: a cap above what is owed charges what is owed', () => {
		expect(plan('2026-11-01', [enrolled('t1', 500000)]).charges).toEqual([
			{ uid: 't1', attempt: 1, amountCents: 100000 }
		]);
	});

	it('Scenario: Never above the balance: pending charges are subtracted', () => {
		const pending = charge('t1', { state: 'pending', amountCents: 100000 });
		expect(plan('2026-11-01', [enrolled('t1'), enrolled('t2')], [pending]).charges).toEqual([]);
		const partial = charge('t1', { state: 'pending', amountCents: 40000 });
		expect(plan('2026-11-01', [enrolled('t1'), enrolled('t2')], [partial]).charges).toEqual([
			{ uid: 't2', attempt: 1, amountCents: 60000 }
		]);
	});

	it('a paid charge the webhook has not recorded yet is subtracted; a recorded one is not', () => {
		const paid = charge('t1', { state: 'succeeded', amountCents: 30000 });
		expect(plan('2026-11-01', [enrolled('t1', 30000), enrolled('t2')], [paid]).charges).toEqual([
			{ uid: 't2', attempt: 1, amountCents: 70000 }
		]);
		// Once recorded, the ledger itself has the payment.
		const recorded = { ...paid, recordedAt: '2026-11-01T11:01:00.000Z' };
		const histories = {
			'2026': { November: { transactions: [{ amount: 300, date: on('2026-11-01') }] } }
		};
		expect(
			plan('2026-11-01', [enrolled('t1', 30000), enrolled('t2')], [recorded], {}, histories).charges
		).toEqual([{ uid: 't2', attempt: 1, amountCents: 70000 }]);
	});

	it('a claim held by another run counts as in flight and is not charged again', () => {
		const claimed = charge('t1', { state: 'claimed', attempts: 1, amountCents: 100000 });
		expect(plan('2026-11-01', [enrolled('t1'), enrolled('t2')], [claimed]).charges).toEqual([]);
	});

	it('Scenario: Due date while a bank payment is pending: other money on its way is not charged', () => {
		const result = planAutopay({
			ledger: ledgerOn('2026-11-01'),
			enrollments: [enrolled('t1')],
			charges: [],
			today: '2026-11-01',
			tenantIds: ['t1'],
			otherInFlightCents: 60000
		});
		expect(result.charges).toEqual([{ uid: 't1', attempt: 1, amountCents: 40000 }]);
		const covered = planAutopay({
			ledger: ledgerOn('2026-11-01'),
			enrollments: [enrolled('t1')],
			charges: [],
			today: '2026-11-01',
			tenantIds: ['t1'],
			otherInFlightCents: 100000
		});
		expect(covered.charges).toEqual([]);
	});

	it('Scenario: Crash after claiming: a stale claim continues under the same attempt number', () => {
		const claimed = charge('t1', { state: 'claimed', attempts: 2, amountCents: 100000 });
		const result = planAutopay({
			ledger: ledgerOn('2026-11-02'),
			enrollments: [enrolled('t1')],
			charges: [claimed],
			today: '2026-11-02',
			tenantIds: ['t1'],
			isStaleClaim: () => true
		});
		expect(result.charges).toEqual([{ uid: 't1', attempt: 2, amountCents: 100000 }]);
	});

	it('Scenario: Nothing due: rent payable early is not charged before its due date', () => {
		expect(plan('2026-10-28', [enrolled('t1')])).toEqual({ cycleKey: null, charges: [] });
		const paid = {
			'2026': { November: { transactions: [{ amount: 1000, date: on('2026-11-01') }] } }
		};
		expect(plan('2026-11-03', [enrolled('t1')], [], {}, paid).charges).toEqual([]);
	});

	it('rent payable early is left out of what an overdue balance charges', () => {
		// November is unpaid; on Nov 25 December is payable (counted in the balance) but not due.
		const ledger = ledgerOn('2026-11-25', { lateFee: 0 });
		expect(ledger.totalCents).toBe(200000);
		expect(dueNow(ledger)).toEqual({ cycleKey: '2026-11-01', dueCents: 100000 });
	});

	it('a later due date starts a new cycle with the whole overdue amount', () => {
		const ledger = ledgerOn('2026-12-01', { lateFee: 0 });
		expect(dueNow(ledger)).toEqual({ cycleKey: '2026-12-01', dueCents: 200000 });
	});

	it('Scenario: Ended lease: what is still owed is charged', () => {
		const result = plan('2027-01-10', [enrolled('t1')], [], { endDate: '2026-11-30', lateFee: 0 });
		expect(result).toEqual({
			cycleKey: '2026-11-01',
			charges: [{ uid: 't1', attempt: 1, amountCents: 100000 }]
		});
	});

	it('Scenario: Minimum charge: less than $0.50 is not charged', () => {
		const histories = {
			'2026': { November: { transactions: [{ amount: 999.6, date: on('2026-11-01') }] } }
		};
		expect(plan('2026-11-02', [enrolled('t1')], [], {}, histories).charges).toEqual([]);
		// A tenant whose cap leaves less than $0.50 for the next tenant: the next is skipped.
		expect(plan('2026-11-01', [enrolled('t1', 99970), enrolled('t2')]).charges).toEqual([
			{ uid: 't1', attempt: 1, amountCents: 99970 }
		]);
	});

	it('Scenario: Card declined: the failed tenant is skipped today and the next one is charged everything', () => {
		const failed = charge('t1', { state: 'failed', attempts: 1, lastAttemptDay: '2026-11-01' });
		expect(plan('2026-11-01', [enrolled('t1', 30000), enrolled('t2')], [failed]).charges).toEqual([
			{ uid: 't2', attempt: 1, amountCents: 100000 }
		]);
	});

	it('Scenario: Retries: each later day is the next attempt, up to 4', () => {
		const failed = (attempts: number, day: string) =>
			charge('t1', { state: 'failed', attempts, lastAttemptDay: day });
		expect(plan('2026-11-02', [enrolled('t1')], [failed(1, '2026-11-01')]).charges).toEqual([
			{ uid: 't1', attempt: 2, amountCents: 100000 }
		]);
		expect(plan('2026-11-04', [enrolled('t1')], [failed(3, '2026-11-03')]).charges).toEqual([
			{ uid: 't1', attempt: 4, amountCents: 100000 }
		]);
		expect(plan('2026-11-05', [enrolled('t1')], [failed(4, '2026-11-04')]).charges).toEqual([]);
	});

	it('Scenario: Giving up: no more attempts for that due date', () => {
		const gaveUp = charge('t1', { state: 'gave-up', attempts: 4, lastAttemptDay: '2026-11-04' });
		expect(plan('2026-11-05', [enrolled('t1')], [gaveUp], { lateFee: 0 }).charges).toEqual([]);
	});

	it('Scenario: Paid by hand meanwhile: no retry', () => {
		const failed = charge('t1', { state: 'failed', attempts: 1, lastAttemptDay: '2026-11-01' });
		const paid = {
			'2026': { November: { transactions: [{ amount: 1000, date: on('2026-11-01') }] } }
		};
		expect(plan('2026-11-02', [enrolled('t1')], [failed], {}, paid).charges).toEqual([]);
	});

	it('Scenario: Re-run on the same day: a succeeded or pending tenant is not charged again', () => {
		const done = charge('t1', { state: 'succeeded', recordedAt: 'x', amountCents: 30000 });
		const histories = {
			'2026': { November: { transactions: [{ amount: 300, date: on('2026-11-01') }] } }
		};
		expect(plan('2026-11-01', [enrolled('t1', 30000)], [done], {}, histories).charges).toEqual([]);
	});

	it('enrollments of someone no longer on the lease are ignored', () => {
		const result = planAutopay({
			ledger: ledgerOn('2026-11-01'),
			enrollments: [enrolled('gone'), enrolled('t1', 30000)],
			charges: [],
			today: '2026-11-01',
			tenantIds: ['t1']
		});
		expect(result.charges).toEqual([{ uid: 't1', attempt: 1, amountCents: 30000 }]);
	});
});

describe('autopay: enrollments', () => {
	it('Scenario: Payment method details stay server-side: the public shape has no method id', () => {
		const shape = publicEnrollment(enrolled('t1', 50000));
		expect(shape).toEqual({
			type: 'card',
			brand: 'visa',
			last4: '4242',
			method: 'Visa ending 4242',
			amountCents: 50000,
			enrolledAt: '2026-10-01T00:00:00.000Z'
		});
		expect(JSON.stringify(shape)).not.toContain('pm_');
	});

	it('labels cards by brand and bank accounts generically', () => {
		expect(methodLabel({ type: 'card', brand: 'amex', last4: '0005' })).toBe(
			'American Express ending 0005'
		);
		expect(methodLabel({ type: 'card', brand: 'cartes_bancaires', last4: '1' })).toBe(
			'Cartes_bancaires ending 1'
		);
		expect(methodLabel({ type: 'us_bank_account', brand: 'STRIPE TEST BANK', last4: '6789' })).toBe(
			'Bank account ending 6789'
		);
	});

	it('orders by enrollment time, then uid', () => {
		const list = [enrolled('b', null, '2026-10-02'), enrolled('c'), enrolled('a')];
		expect(list.sort(byEnrollmentOrder).map((e) => e.uid)).toEqual(['a', 'c', 'b']);
	});

	it('projects each tenant’s share of a due amount', () => {
		const split = projectedSplit(100000, [
			enrolled('t2', null, '2026-10-02'),
			enrolled('t1', 30000)
		]);
		expect(Object.fromEntries(split)).toEqual({ t1: 30000, t2: 70000 });
		expect(
			Object.fromEntries(
				projectedSplit(20000, [enrolled('t1', 30000), enrolled('t2', null, '2026-10-02')])
			)
		).toEqual({
			t1: 20000,
			t2: 0
		});
	});

	it('parses amounts as whole cents', () => {
		expect(parseAmountCents(500)).toBe(50000);
		expect(parseAmountCents(0.1 + 0.2)).toBe(30);
		expect(parseAmountCents(1.005)).toBeUndefined();
		expect(parseAmountCents(0)).toBeUndefined();
		expect(parseAmountCents(-1)).toBeUndefined();
		expect(parseAmountCents('5')).toBeUndefined();
		expect(parseAmountCents(Number.NaN)).toBeUndefined();
	});
});
