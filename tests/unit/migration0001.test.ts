import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeFirestore } from '../helpers/fakeFirestore';
import migration from '../../migrations/0001-leases-from-tenant-links';
import { runMigrations } from '../../scripts/migrate/runner';
import { computeBalance } from '../../src/lib/server/payments';

// data-migrations: Leases from existing tenant links.
let fake: FakeFirestore;
let logs: string[];
const NOW = new Date('2026-06-15T16:00:00Z');

const run = (dryRun = false) =>
	runMigrations({
		db: fake as unknown as Firestore,
		migrations: [migration],
		dryRun,
		findRestorePoint: async () => null,
		log: (m) => logs.push(m),
		now: () => NOW
	});

const tenant = (id: string, extra: Record<string, unknown> = {}) =>
	fake.seed(`users/${id}`, { firstName: id, lastName: 'T', permissions: 'user', ...extra });
const link = (tenantId: string, propertyId: string, moveInMonth?: string) =>
	fake.seed(`junction_user_property/${tenantId}_${propertyId}`, {
		tenantId,
		propertyId,
		...(moveInMonth && { moveInMonth })
	});

beforeEach(() => {
	fake = new FakeFirestore();
	logs = [];
	fake.seed('properties/p1', { title: 'One', rent: 1000 });
	tenant('t1');
	tenant('t2');
});

describe('data-migrations: Leases from existing tenant links', () => {
	it('Scenario: Property with tenants gets one lease starting in the earliest move-in month', async () => {
		link('t1', 'p1', '2026-03');
		link('t2', 'p1', '2026-05');
		fake.seed('properties/p1/payment_history/2026', { March: { remainingBalance: 0 } });
		fake.seed('properties/p1/recorded_invoices/in_1', { recordedAt: 'x' });

		await run();

		expect(fake.peek('leases/migrated-p1')).toEqual({
			propertyId: 'p1',
			tenantIds: ['t1', 't2'],
			rent: 1000,
			startDate: '2026-03-01',
			endDate: null,
			document: null,
			createdAt: NOW.toISOString(),
			updatedAt: NOW.toISOString(),
			migratedFrom: 'junction_user_property'
		});
		expect(fake.peek('leases/migrated-p1/payment_history/2026')).toEqual({
			March: { remainingBalance: 0 }
		});
		expect(fake.peek('leases/migrated-p1/recorded_invoices/in_1')).toEqual({ recordedAt: 'x' });
	});

	it('Scenario: No move-in month starts the lease on the first of the current month', async () => {
		link('t1', 'p1');

		await run();

		expect(fake.peek('leases/migrated-p1')?.startDate).toBe('2026-06-01');
	});

	it('Scenario: Balance unchanged for the tenant with the earliest move-in month', async () => {
		link('t1', 'p1', '2026-03');
		fake.seed('properties/p1/payment_history/2026', { March: { remainingBalance: 250 } });
		const before = computeBalance({
			rent: 1000,
			startMonth: '2026-03',
			histories: { '2026': { March: { remainingBalance: 250 } } },
			now: NOW
		});

		await run();

		const lease = fake.peek('leases/migrated-p1') as { rent: number; startDate: string };
		const after = computeBalance({
			rent: lease.rent,
			startMonth: lease.startDate.slice(0, 7),
			histories: {
				'2026': fake.peek('leases/migrated-p1/payment_history/2026') as never
			},
			now: NOW
		});
		expect(after).toEqual(before);
	});

	it('Scenario: Run again creates no second lease and keeps an edited lease', async () => {
		link('t1', 'p1', '2026-03');
		await run();
		fake.seed('leases/migrated-p1', { ...fake.peek('leases/migrated-p1'), rent: 1100 });
		fake.remove('_migrations/0001-leases-from-tenant-links');

		await run();

		expect((await fake.collection('leases').get()).size).toBe(1);
		expect(fake.peek('leases/migrated-p1')?.rent).toBe(1100);
	});

	it('Scenario: Run again never replaces history the app has recorded on the lease since', async () => {
		link('t1', 'p1', '2026-03');
		fake.seed('properties/p1/payment_history/2026', { March: { remainingBalance: 1000 } });
		fake.seed('properties/p1/recorded_invoices/in_old', { recordedAt: 'old' });
		await run();
		// After the deploy, a payment is recorded on the lease.
		fake.seed('leases/migrated-p1/payment_history/2026', { March: { remainingBalance: 500 } });
		fake.seed('leases/migrated-p1/recorded_invoices/in_new', { recordedAt: 'new' });
		fake.seed('properties/p1/recorded_invoices/in_late', { recordedAt: 'late' });
		fake.remove('_migrations/0001-leases-from-tenant-links');

		await run();

		expect(fake.peek('leases/migrated-p1/payment_history/2026')).toEqual({
			March: { remainingBalance: 500 }
		});
		expect(fake.peek('leases/migrated-p1/recorded_invoices/in_new')).toEqual({ recordedAt: 'new' });
		// Documents the lease does not have yet are still copied.
		expect(fake.peek('leases/migrated-p1/recorded_invoices/in_late')).toEqual({
			recordedAt: 'late'
		});
	});

	it('Scenario: Links kept: junctions and property history are left in place', async () => {
		link('t1', 'p1', '2026-03');
		fake.seed('properties/p1/payment_history/2026', { March: { remainingBalance: 0 } });

		await run();

		expect(fake.peek('junction_user_property/t1_p1')).toBeDefined();
		expect(fake.peek('properties/p1/payment_history/2026')).toBeDefined();
	});

	it('skips admins, missing users and missing properties, and reports them', async () => {
		tenant('boss', { permissions: 'admin' });
		link('boss', 'p1');
		link('ghost', 'p1');
		link('t1', 'gone');

		await run();

		expect((await fake.collection('leases').get()).size).toBe(0);
		expect(fake.peek('_migrations/0001-leases-from-tenant-links')?.summary).toEqual({
			leases: [],
			skipped: [
				'gone: property does not exist',
				'p1: boss is an admin',
				'p1: tenant ghost does not exist',
				'p1: no tenants left to put on a lease'
			],
			balanceChanges: [],
			onSeveralLeases: []
		});
	});
});

describe('data-migrations: 0001 flags data the old app refused', () => {
	it('warns about a tenant linked to several properties and lists them in the summary', async () => {
		fake.seed('properties/p2', { title: 'Two', rent: 900 });
		link('t1', 'p1', '2026-03');
		link('t1', 'p2', '2026-04');

		await run();

		expect(logs).toContain('  WARNING: tenant linked to several properties, t1: p1, p2');
		expect(fake.peek('_migrations/0001-leases-from-tenant-links')?.summary).toMatchObject({
			onSeveralLeases: ['t1: p1, p2']
		});
		expect((await fake.collection('leases').get()).size).toBe(2);
	});
});

describe('data-migrations: Dry run of 0001 shows balances before and after', () => {
	it("prints each housemate's balance, flags the one that changes, and writes nothing", async () => {
		link('t1', 'p1', '2026-04');
		link('t2', 'p1', '2026-06');

		await run(true);

		expect(logs).toContain('  migrated-p1: tenant t1 owes $3000.00 before, $3000.00 after');
		expect(logs).toContain('  migrated-p1: tenant t2 owes $1000.00 before, $3000.00 after');
		expect(logs.some((l) => l.includes('"balanceChanges":["t2: $1000.00 -> $3000.00"]'))).toBe(
			true
		);
		expect(fake.peek('leases/migrated-p1')).toBeUndefined();
		expect(fake.peek('_migrations/0001-leases-from-tenant-links')).toBeUndefined();
	});
});
