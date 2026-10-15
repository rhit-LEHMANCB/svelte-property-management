import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeFirestore } from '../helpers/fakeFirestore';
import migration from '../../migrations/0002-archive-prototype-leases';
import { runMigrations } from '../../scripts/migrate/runner';

// data-migrations: Prototype leases archived.
let fake: FakeFirestore;
let logs: string[];
const NOW = new Date('2026-10-14T16:00:00Z');

const run = (dryRun = false) =>
	runMigrations({
		db: fake as unknown as Firestore,
		migrations: [migration],
		dryRun,
		findRestorePoint: async () => null,
		log: (m) => logs.push(m),
		now: () => NOW
	});

const prototype = {
	propertyId: 'p1',
	users: ['t1'],
	rent: 1929,
	startDate: '2024-08-04',
	endDate: '2024-08-14',
	lease: 'https://example.test/lease.pdf'
};
const current = {
	propertyId: 'p1',
	tenantIds: ['t1'],
	rent: 1000,
	startDate: '2026-03-01',
	endDate: null,
	document: null
};

beforeEach(() => {
	fake = new FakeFirestore();
	logs = [];
	fake.seed('leases/old1', prototype);
	fake.seed('leases/new1', current);
});

describe('data-migrations: Prototype leases archived', () => {
	it('Scenario: Prototype lease moved: data kept in legacy_leases, gone from leases', async () => {
		await run();

		expect(fake.peek('leases/old1')).toBeUndefined();
		expect(fake.peek('legacy_leases/old1')).toEqual({
			...prototype,
			archivedAt: NOW.toISOString(),
			archivedBy: '0002-archive-prototype-leases'
		});
		expect(fake.peek('_migrations/0002-archive-prototype-leases')).toMatchObject({
			status: 'applied',
			summary: { archived: ['old1'] }
		});
	});

	it('Run again moves nothing more and keeps the archive', async () => {
		await run();
		fake.remove('_migrations/0002-archive-prototype-leases');

		await run();

		expect(fake.peek('legacy_leases/old1')).toMatchObject(prototype);
		expect(fake.peek('leases/new1')).toEqual(current);
		expect(fake.peek('_migrations/0002-archive-prototype-leases')?.summary).toEqual({
			archived: []
		});
	});

	it('Scenario: Current leases untouched', async () => {
		fake.seed('leases/new1/payment_history/2026', { March: { remainingBalance: 0 } });

		await run();

		expect(fake.peek('leases/new1')).toEqual(current);
		expect(fake.peek('leases/new1/payment_history/2026')).toEqual({
			March: { remainingBalance: 0 }
		});
		expect(fake.peek('legacy_leases/new1')).toBeUndefined();
	});

	it('Scenario: Dry run changes nothing', async () => {
		await run(true);

		expect(fake.peek('leases/old1')).toEqual(prototype);
		expect(fake.peek('legacy_leases/old1')).toBeUndefined();
		expect(fake.peek('_migrations/0002-archive-prototype-leases')).toBeUndefined();
	});

	it('Scenario: Unexpected subcollections stop the run and nothing is moved', async () => {
		// old1 is listed first and has no subcollections, so it would be moved if checking and moving
		// were done one document at a time.
		fake.seed('leases/old2', prototype);
		fake.seed('leases/old2/payment_history/2024', { August: { remainingBalance: 0 } });

		await expect(run()).rejects.toThrow(/leases\/old2 has no tenantIds but has subcollections/);
		expect(fake.peek('leases/old1')).toEqual(prototype);
		expect(fake.peek('leases/old2')).toEqual(prototype);
		expect(fake.peek('legacy_leases/old1')).toBeUndefined();
		expect(fake.peek('legacy_leases/old2')).toBeUndefined();
	});
});
