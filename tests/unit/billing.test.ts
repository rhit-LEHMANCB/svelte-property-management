import { describe, expect, it } from 'vitest';
import {
	addDays,
	allocate,
	allocationParts,
	computeLedger,
	dayOf,
	defaultLateFee,
	ledgerYears,
	monthCharge,
	type LeaseTerms
} from '../../src/lib/server/billing';
import { getMonthKey } from '../../src/lib/server/payments';

/** Noon in Indianapolis on `day`. */
const on = (day: string) => new Date(`${day}T16:00:00Z`);
const month = (key: string) => getMonthKey(on(`${key}-15`));
const ts = (day: string) => ({ toDate: () => on(day) });

const lease = (terms: Partial<LeaseTerms> = {}): LeaseTerms => ({
	rent: 1500,
	startDate: '2026-10-15',
	endDate: '2027-03-14',
	deposit: null,
	lateFee: 75,
	graceDays: 5,
	lateFeesFrom: '2026-01-01',
	...terms
});

describe('lease-billing: Prorated partial months', () => {
	it('Scenario: Mid-month start and end', () => {
		const l = lease();
		expect(monthCharge(l, month('2026-10'))).toBe(82258);
		expect(monthCharge(l, month('2026-11'))).toBe(150000);
		expect(monthCharge(l, month('2027-02'))).toBe(150000);
		expect(monthCharge(l, month('2027-03'))).toBe(67742);
		expect(monthCharge(l, month('2027-04'))).toBe(0);
		expect(monthCharge(l, month('2026-09'))).toBe(0);
	});

	it('Scenario: Starts on the 1st, month to month', () => {
		const l = lease({ rent: 1200, startDate: '2026-11-01', endDate: null });
		expect(monthCharge(l, month('2026-11'))).toBe(120000);
		expect(monthCharge(l, month('2030-02'))).toBe(120000);
	});

	it('Scenario: Start and end in one month', () => {
		const l = lease({ rent: 900, startDate: '2027-02-10', endDate: '2027-02-19' });
		expect(monthCharge(l, month('2027-02'))).toBe(32143);
		expect(monthCharge(l, month('2027-03'))).toBe(0);
	});

	it('Scenario: Leap year', () => {
		expect(
			monthCharge(lease({ rent: 1000, startDate: '2028-02-15', endDate: null }), month('2028-02'))
		).toBe(51724);
	});

	it('the ledger charges each month owed and stops after the end month', () => {
		const ledger = computeLedger({ lease: lease(), histories: {}, now: on('2027-06-01') });
		expect(ledger.rent.map((r) => [r.month.key, r.chargeCents])).toEqual([
			['2026-10', 82258],
			['2026-11', 150000],
			['2026-12', 150000],
			['2027-01', 150000],
			['2027-02', 150000],
			['2027-03', 67742]
		]);
	});
});

describe('lease-billing: Rent due dates', () => {
	it('Scenario: Mid-month start: owed from the 1st, due on the start date', () => {
		const ledger = computeLedger({
			lease: lease({ endDate: null }),
			histories: {},
			now: on('2026-10-03')
		});
		expect(ledger.rent).toHaveLength(1);
		expect(ledger.rent[0]).toMatchObject({ dueDate: '2026-10-15', owedCents: 82258 });
		expect(ledger.dueDate).toBe('2026-10-15');
		expect(ledger.totalCents).toBe(82258);
	});

	it('Scenario: Later months are due on the 1st', () => {
		const ledger = computeLedger({ lease: lease(), histories: {}, now: on('2026-11-02') });
		expect(ledger.rent[1]).toMatchObject({ dueDate: '2026-11-01' });
	});

	it('Scenario: Start on the 1st is due on the 1st', () => {
		const ledger = computeLedger({
			lease: lease({ startDate: '2026-11-01' }),
			histories: {},
			now: on('2026-11-02')
		});
		expect(ledger.rent[0].dueDate).toBe('2026-11-01');
	});

	it('an upcoming lease starting next month owes no rent yet', () => {
		const ledger = computeLedger({
			lease: lease({ startDate: '2026-11-01' }),
			histories: {},
			now: on('2026-10-20')
		});
		expect(ledger.rent).toEqual([]);
		expect(ledger.totalCents).toBe(0);
		expect(ledger.dueDate).toBeNull();
	});
});

describe('lease-billing: Credit from overpaid months', () => {
	it('Scenario: Existing lease recomputed: a full October payment leaves $677.42 credit for November', () => {
		const ledger = computeLedger({
			lease: lease({ endDate: null }),
			histories: { '2026': { October: { remainingBalance: 0, transactions: [{ amount: 1500 }] } } },
			now: on('2026-11-01')
		});
		expect(ledger.rent[0]).toMatchObject({ paidCents: 150000, owedCents: 0 });
		expect(ledger.rent[1]).toMatchObject({ creditAppliedCents: 67742, owedCents: 82258 });
		expect(ledger.creditCents).toBe(0);
		expect(ledger.totalCents).toBe(82258);
	});

	it('Scenario: Credit larger than what is owed is shown and the balance is $0.00', () => {
		const ledger = computeLedger({
			lease: lease({ endDate: null }),
			histories: { '2026': { October: { transactions: [{ amount: 1500 }] } } },
			now: on('2026-10-20')
		});
		expect(ledger.totalCents).toBe(0);
		expect(ledger.creditCents).toBe(67742);
	});

	it('money recorded for a month not owed yet is credit', () => {
		const ledger = computeLedger({
			lease: lease({ endDate: null }),
			histories: {
				'2026': {
					October: { transactions: [{ amount: 822.58 }] },
					November: { transactions: [{ amount: 100 }] }
				}
			},
			now: on('2026-10-20')
		});
		expect(ledger.creditCents).toBe(10000);
	});

	it('a legacy entry without transactions counts as the rent minus its remaining balance', () => {
		const ledger = computeLedger({
			lease: lease({ startDate: '2026-10-01', endDate: null }),
			histories: { '2026': { October: { remainingBalance: 600 } } },
			now: on('2026-10-20')
		});
		expect(ledger.rent[0]).toMatchObject({ paidCents: 90000, owedCents: 60000 });
	});

	it('a rent change re-prices every month and keeps what was paid', () => {
		const histories = { '2026': { November: { transactions: [{ amount: 1500 }] } } };
		const ledger = computeLedger({
			lease: lease({ rent: 1200, startDate: '2026-11-01', endDate: null }),
			histories,
			now: on('2026-11-20')
		});
		expect(ledger.rent[0]).toMatchObject({ chargeCents: 120000, owedCents: 0 });
		expect(ledger.creditCents).toBe(30000);
	});
});

describe('lease-billing: Late fee charged once per late month', () => {
	const nov = (transactions: { amount: number; date: ReturnType<typeof ts> }[]) => ({
		'2026': {
			October: { transactions: [{ amount: 822.58, date: ts('2026-10-15') }] },
			November: { transactions }
		}
	});

	it('Scenario: Unpaid after grace: a $75.00 fee is owed from the day after the grace period', () => {
		const histories = nov([{ amount: 1000, date: ts('2026-11-03') }]);
		expect(computeLedger({ lease: lease(), histories, now: on('2026-11-06') }).lateFees).toEqual(
			[]
		);
		const ledger = computeLedger({ lease: lease(), histories, now: on('2026-11-07') });
		expect(ledger.lateFees).toEqual([
			expect.objectContaining({ dueDate: '2026-11-07', amountCents: 7500, owedCents: 7500 })
		]);
		expect(ledger.owed).toEqual({ lateFeesCents: 7500, depositCents: 0, rentCents: 50000 });
	});

	it('Scenario: Paid within grace: no late fee', () => {
		const histories = nov([{ amount: 1500, date: ts('2026-11-06') }]);
		expect(computeLedger({ lease: lease(), histories, now: on('2026-11-20') }).lateFees).toEqual(
			[]
		);
	});

	it('Scenario: Paid after the fee: the fee stays owed', () => {
		const histories = nov([{ amount: 1500, date: ts('2026-11-10') }]);
		const ledger = computeLedger({ lease: lease(), histories, now: on('2026-11-20') });
		expect(ledger.owed).toEqual({ lateFeesCents: 7500, depositCents: 0, rentCents: 0 });
	});

	it('Scenario: Before the late-fee start date: never charged', () => {
		const ledger = computeLedger({
			lease: lease({ lateFeesFrom: '2026-11-02' }),
			histories: {},
			now: on('2026-12-20')
		});
		expect(ledger.lateFees.map((f) => f.month.key)).toEqual(['2026-12']);
	});

	it('Scenario: No late fee: a fee of 0 is never charged', () => {
		const ledger = computeLedger({
			lease: lease({ lateFee: 0 }),
			histories: {},
			now: on('2026-12-20')
		});
		expect(ledger.lateFees).toEqual([]);
	});

	it('a lease without late-fee terms (not yet migrated) charges no fee', () => {
		const ledger = computeLedger({
			lease: lease({ lateFee: undefined, graceDays: undefined, lateFeesFrom: undefined }),
			histories: {},
			now: on('2026-12-20')
		});
		expect(ledger.lateFees).toEqual([]);
	});

	it('credit counts as paid on time', () => {
		const ledger = computeLedger({
			lease: lease({ endDate: null }),
			histories: {
				'2026': { October: { transactions: [{ amount: 2322.58, date: ts('2026-10-15') }] } }
			},
			now: on('2026-11-20')
		});
		expect(ledger.lateFees).toEqual([]);
		expect(ledger.totalCents).toBe(0);
	});

	it('the recorded amount wins over a later change of the lease fee, and a waiver clears what is unpaid', () => {
		const lateFees = { '2026-10': { amount: 75, paid: 25 } };
		let ledger = computeLedger({
			lease: lease({ lateFee: 50 }),
			histories: {},
			lateFees,
			now: on('2026-10-25')
		});
		expect(ledger.lateFees[0]).toMatchObject({
			amountCents: 7500,
			paidCents: 2500,
			owedCents: 5000
		});

		ledger = computeLedger({
			lease: lease(),
			histories: {},
			lateFees: { '2026-10': { ...lateFees['2026-10'], waivedAt: '2026-10-26T00:00:00Z' } },
			now: on('2026-10-27')
		});
		expect(ledger.lateFees[0]).toMatchObject({ waived: true, owedCents: 0, paidCents: 2500 });
		expect(ledger.owed.lateFeesCents).toBe(0);
	});
});

describe('security-deposits: owed, held and settled', () => {
	const withDeposit = lease({
		startDate: '2026-11-01',
		endDate: '2027-10-31',
		deposit: { amount: 1000, dueDate: '2026-11-01' }
	});

	it('Scenario: Upcoming lease: the deposit is owed before the start', () => {
		const ledger = computeLedger({ lease: withDeposit, histories: {}, now: on('2026-10-10') });
		expect(ledger.owed).toEqual({ lateFeesCents: 0, depositCents: 100000, rentCents: 0 });
		expect(ledger.dueDate).toBe('2026-11-01');
	});

	it('Scenario: Partial deposit', () => {
		const ledger = computeLedger({
			lease: withDeposit,
			histories: {},
			deposit: { paid: 400 },
			now: on('2026-10-10')
		});
		expect(ledger.deposit).toMatchObject({ owedCents: 60000, heldCents: 40000, toSettle: false });
	});

	it('an unpaid deposit after its due date never incurs a late fee', () => {
		const ledger = computeLedger({
			lease: withDeposit,
			histories: {
				'2026': { November: { transactions: [{ amount: 1500, date: ts('2026-11-01') }] } }
			},
			now: on('2026-12-01')
		});
		expect(ledger.lateFees).toEqual([]);
		expect(ledger.owed.depositCents).toBe(100000);
	});

	it('Scenario: Ended lease still holding a deposit is to settle; a matching settlement settles it', () => {
		const settlement = {
			returned: 800,
			deductions: [{ amount: 200, reason: 'Carpet cleaning' }],
			recordedAt: '2027-11-02T00:00:00Z',
			recordedBy: 'admin'
		};
		const now = on('2027-11-05');
		const histories = {};
		expect(
			computeLedger({ lease: withDeposit, histories, deposit: { paid: 1000 }, now }).deposit
		).toMatchObject({ heldCents: 100000, toSettle: true, settled: false });
		expect(
			computeLedger({ lease: withDeposit, histories, deposit: { paid: 1000, settlement }, now })
				.deposit
		).toMatchObject({ heldCents: 0, toSettle: false, settled: true });
		// Scenario: Deposit paid after settlement: the settlement no longer matches.
		expect(
			computeLedger({ lease: withDeposit, histories, deposit: { paid: 1100, settlement }, now })
				.deposit
		).toMatchObject({ heldCents: 110000, toSettle: true, settled: false });
	});
});

describe('payment allocation', () => {
	const owing = computeLedger({
		lease: lease({
			startDate: '2026-10-01',
			endDate: null,
			deposit: { amount: 1000, dueDate: '2026-10-01' }
		}),
		histories: {
			'2026': {
				October: { transactions: [{ amount: 1500, date: ts('2026-10-01') }] },
				November: { transactions: [{ amount: 1000, date: ts('2026-11-02') }] }
			}
		},
		deposit: { paid: 500 },
		now: on('2026-11-20')
	});

	it('the ledger owes a $75 late fee, $500 deposit and $500 rent', () => {
		expect(owing.owed).toEqual({ lateFeesCents: 7500, depositCents: 50000, rentCents: 50000 });
	});

	it('Scenario: Split across parts: late fee, then deposit, then rent', () => {
		const result = allocate(owing, { startDate: '2026-10-01' }, 60000);
		expect(allocationParts(result)).toEqual({
			lateFeeCents: 7500,
			depositCents: 50000,
			rentCents: 2500
		});
		expect(result.rent).toEqual([
			{ month: expect.objectContaining({ key: '2026-11' }), cents: 2500 }
		]);
	});

	it('rent only skips late fees and the deposit', () => {
		const result = allocate(owing, { startDate: '2026-10-01' }, 60000, { rentOnly: true });
		expect(allocationParts(result)).toEqual({ lateFeeCents: 0, depositCents: 0, rentCents: 60000 });
	});

	it('anything beyond what is owed goes to the last rent month', () => {
		const result = allocate(owing, { startDate: '2026-10-01' }, 200000);
		expect(result.rent.at(-1)).toEqual({
			month: expect.objectContaining({ key: '2026-11' }),
			cents: 142500
		});
	});

	it('with no rent month owed yet, the rest goes to the first month', () => {
		const upcoming = computeLedger({
			lease: lease({ startDate: '2026-12-10', deposit: { amount: 100, dueDate: '2026-12-10' } }),
			histories: {},
			now: on('2026-11-20')
		});
		const result = allocate(upcoming, { startDate: '2026-12-10' }, 15000);
		expect(result.depositCents).toBe(10000);
		expect(result.rent).toEqual([
			{ month: expect.objectContaining({ key: '2026-12' }), cents: 5000 }
		]);
	});
});

describe('helpers', () => {
	it('defaultLateFee is 5% of rent to the cent', () => {
		expect(defaultLateFee(1500)).toBe(75);
		expect(defaultLateFee(1234.5)).toBe(61.73);
	});

	it('addDays crosses months and years', () => {
		expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
	});

	it('dayOf uses the business time zone', () => {
		// 03:30 UTC on 1 April is still 31 March in Indianapolis.
		expect(dayOf(new Date('2026-04-01T03:30:00Z'))).toBe('2026-03-31');
		expect(dayOf('2026-04-01T03:30:00Z')).toBe('2026-04-01');
		expect(dayOf(undefined)).toBeUndefined();
	});

	it('ledgerYears includes the start year even before rent is owed', () => {
		expect(ledgerYears({ startDate: '2027-01-10', endDate: null }, on('2026-12-20'))).toEqual([
			'2027'
		]);
		expect(ledgerYears({ startDate: '2026-11-10', endDate: null }, on('2027-01-20'))).toEqual([
			'2026',
			'2027'
		]);
	});
});
