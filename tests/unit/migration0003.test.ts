import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeFirestore } from '../helpers/fakeFirestore';
import migration from '../../migrations/0003-lease-billing-terms';
import { runMigrations } from '../../scripts/migrate/runner';
import { computeLedger } from '../../src/lib/server/billing';

// data-migrations: Billing terms on existing leases.
let fake: FakeFirestore;
let logs: string[];
// 2026-10-20 in Indianapolis.
const NOW = new Date('2026-10-20T16:00:00Z');

const run = (dryRun = false) =>
	runMigrations({
		db: fake as unknown as Firestore,
		migrations: [migration],
		dryRun,
		findRestorePoint: async () => null,
		log: (m) => logs.push(m),
		now: () => NOW
	});

const existing = {
	propertyId: 'p1',
	tenantIds: ['t1'],
	rent: 1500,
	startDate: '2026-10-15',
	endDate: null,
	document: null
};
const history = { October: { remainingBalance: 0, transactions: [{ amount: 1500 }] } };

beforeEach(() => {
	fake = new FakeFirestore();
	logs = [];
	fake.seed('leases/old', existing);
	fake.seed('leases/old/payment_history/2026', history);
	fake.seed('leases/new', {
		...existing,
		rent: 1000,
		deposit: { amount: 500, dueDate: '2026-11-01' },
		lateFee: 40,
		graceDays: 3,
		lateFeesFrom: '2026-10-18'
	});
});

describe('data-migrations: Billing terms on existing leases', () => {
	it('Scenario: Existing lease gets no deposit, a 5% late fee, 5 grace days and the run date; history is unchanged', async () => {
		await run();

		expect(fake.peek('leases/old')).toEqual({
			...existing,
			deposit: null,
			lateFee: 75,
			graceDays: 5,
			lateFeesFrom: '2026-10-20'
		});
		expect(fake.peek('leases/old/payment_history/2026')).toEqual(history);
		expect(fake.peek('_migrations/0003-lease-billing-terms')).toMatchObject({
			status: 'applied',
			summary: { updated: ['old'], skipped: ['new'], lateFeesFrom: '2026-10-20' }
		});
	});

	it('Scenario: Run again: a lease saved by the new code, or already migrated, is left as it is', async () => {
		await run();
		const after = fake.peek('leases/old');
		// Re-running the migration body directly, as a failed run would be repeated.
		const writes: unknown[] = [];
		await migration.up({
			db: fake as unknown as Firestore,
			dryRun: false,
			now: new Date('2026-11-01T16:00:00Z'),
			log: () => undefined,
			write: { set: async (...args) => void writes.push(args), delete: async () => undefined }
		});
		expect(writes).toEqual([]);
		expect(fake.peek('leases/old')).toEqual(after);
		expect(fake.peek('leases/new')).toMatchObject({ lateFee: 40, graceDays: 3 });
	});

	it('Scenario: Prorated after the migration: October is charged 17 of 31 days and the rest is credit', async () => {
		await run();
		const ledger = computeLedger({
			lease: fake.peek('leases/old') as never,
			histories: { '2026': history },
			now: NOW
		});
		expect(ledger.rent[0]).toMatchObject({ chargeCents: 82258, paidCents: 150000, owedCents: 0 });
		expect(ledger.creditCents).toBe(67742);
		expect(ledger.totalCents).toBe(0);
	});

	it('a dry run writes nothing', async () => {
		await run(true);
		expect(fake.peek('leases/old')).toEqual(existing);
	});

	it('rounds the late fee to the cent', async () => {
		fake.seed('leases/odd', { ...existing, rent: 1234.5 });
		await run();
		expect(fake.peek('leases/odd')).toMatchObject({ lateFee: 61.73 });
	});
});
