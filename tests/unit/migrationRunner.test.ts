import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from '../helpers/fakeFirestore';
import { runMigrations, MigrationLockedError, STALE_LOCK_MS } from '../../scripts/migrate/runner';
import type { Migration } from '../../scripts/migrate/types';

// data-migrations: the runner, against an in-memory Firestore.
let fake: FakeFirestore;
let db: Firestore;
let logs: string[];
const NOW = new Date('2026-10-13T12:00:00Z');
const BACKUP = {
	backup: 'projects/p/locations/us/backups/b1',
	snapshotTime: '2026-10-13T03:00:00Z'
};

const migration = (name: string, up: Migration['up'] = async () => ({ ok: true })): Migration => ({
	name,
	description: `Migration ${name}`,
	undo: 'Delete what it wrote.',
	up
});

const run = (migrations: Migration[], extra: Partial<Parameters<typeof runMigrations>[0]> = {}) =>
	runMigrations({
		db,
		migrations,
		dryRun: false,
		findRestorePoint: async () => BACKUP,
		log: (m) => logs.push(m),
		now: () => NOW,
		...extra
	});

beforeEach(() => {
	fake = new FakeFirestore();
	db = fake as unknown as Firestore;
	logs = [];
});

describe('data-migrations: Migration files', () => {
	it('Scenario: Order (0001 runs before 0002, whatever order they are given in)', async () => {
		const order: string[] = [];
		const result = await run([
			migration('0002-example', async () => (order.push('0002'), {})),
			migration('0001-first', async () => (order.push('0001'), {}))
		]);
		expect(order).toEqual(['0001', '0002']);
		expect(result.applied).toEqual(['0001-first', '0002-example']);
	});

	it('refuses to run a set with a bad name or missing undo steps, before writing anything', async () => {
		await expect(run([{ ...migration('0001-a'), undo: ' ' }])).rejects.toThrow(/undo/);
		await expect(run([migration('1-bad')])).rejects.toThrow(/0001-short-name/);
		expect(fake.peek('_migrations/_lock')).toBeUndefined();
	});
});

describe('data-migrations: Applied once', () => {
	it('Scenario: Pending migration is applied and recorded with start, finish, outcome and summary', async () => {
		await run([migration('0001-a', async () => ({ leases: 2 }))]);
		expect(fake.peek('_migrations/0001-a')).toEqual({
			status: 'applied',
			description: 'Migration 0001-a',
			startedAt: NOW.toISOString(),
			finishedAt: NOW.toISOString(),
			restorePoint: BACKUP,
			summary: { leases: 2 }
		});
	});

	it('Scenario: Already applied migrations are not run again', async () => {
		fake.seed('_migrations/0001-a', { status: 'applied' });
		const up = vi.fn(async () => ({}));
		const result = await run([migration('0001-a', up)]);
		expect(up).not.toHaveBeenCalled();
		expect(result.skipped).toEqual(['0001-a']);
		expect(logs).toContain('Nothing to migrate.');
	});

	it('Scenario: Interrupted run: a migration recorded as failed runs again', async () => {
		fake.seed('_migrations/0001-a', { status: 'failed', error: 'boom' });
		const up = vi.fn(async () => ({}));
		await run([migration('0001-a', up)]);
		expect(up).toHaveBeenCalledOnce();
		expect(fake.peek('_migrations/0001-a')?.status).toBe('applied');
	});
});

describe('data-migrations: Restore point', () => {
	it('Scenario: Start time and backup are logged and recorded before any data changes', async () => {
		let recordDuringRun: unknown;
		await run([
			migration('0001-a', async () => {
				recordDuringRun = fake.peek('_migrations/0001-a');
				return {};
			})
		]);
		expect(recordDuringRun).toMatchObject({
			status: 'running',
			startedAt: NOW.toISOString(),
			restorePoint: BACKUP
		});
		expect(logs[0]).toContain(BACKUP.backup);
		expect(logs).toContain(`0001-a: starting at ${NOW.toISOString()}`);
	});

	it('Scenario: No backup yet: warns, records none and continues', async () => {
		await run([migration('0001-a')], { findRestorePoint: async () => null });
		expect(logs[0]).toMatch(/WARNING.*no finished backup/);
		expect(fake.peek('_migrations/0001-a')).toMatchObject({
			status: 'applied',
			restorePoint: null
		});
	});
});

describe('data-migrations: Backup schedule required', () => {
	it('Scenario: No schedule: nothing is applied and the run fails with the message', async () => {
		const up = vi.fn(async () => ({}));
		await expect(
			run([migration('0001-a', up)], {
				findRestorePoint: async () => {
					throw new Error('no backup schedule');
				}
			})
		).rejects.toThrow('no backup schedule');
		expect(up).not.toHaveBeenCalled();
		expect(fake.peek('_migrations/0001-a')).toBeUndefined();
	});
});

describe('data-migrations: Failure stops the deploy', () => {
	it('Scenario: Migration fails: later ones are not applied and the record says failed', async () => {
		const later = vi.fn(async () => ({}));
		await expect(
			run([
				migration('0001-a', async () => {
					throw new Error('bad data');
				}),
				migration('0002-b', later)
			])
		).rejects.toThrow('bad data');
		expect(later).not.toHaveBeenCalled();
		expect(fake.peek('_migrations/0001-a')).toMatchObject({ status: 'failed', error: 'bad data' });
		expect(fake.peek('_migrations/0002-b')).toBeUndefined();
		expect(fake.peek('_migrations/_lock')).toBeUndefined();
	});
});

describe('data-migrations: Dry run', () => {
	it('Scenario: Dry run prints planned changes and writes nothing, not even records', async () => {
		fake.seed('things/a', { n: 1 });
		await run(
			[
				migration('0001-a', async (ctx) => {
					await ctx.write.set(ctx.db.collection('things').doc('b'), { n: 2 });
					await ctx.write.delete(ctx.db.collection('things').doc('a'));
					return {};
				})
			],
			{ dryRun: true }
		);
		expect(fake.peek('things/b')).toBeUndefined();
		expect(fake.peek('things/a')).toEqual({ n: 1 });
		expect(fake.peek('_migrations/0001-a')).toBeUndefined();
		expect(fake.peek('_migrations/_lock')).toBeUndefined();
		expect(logs.some((l) => l.includes('would set things/b'))).toBe(true);
		expect(logs.some((l) => l.includes('would delete things/a'))).toBe(true);
	});

	it('writes through ctx.write when it is not a dry run', async () => {
		await run([
			migration('0001-a', async (ctx) => {
				await ctx.write.set(ctx.db.collection('things').doc('b'), { n: 2 });
				return {};
			})
		]);
		expect(fake.peek('things/b')).toEqual({ n: 2 });
	});
});

describe('data-migrations: Single runner', () => {
	it('Scenario: Concurrent runs: a fresh lock makes the second run fail and apply nothing', async () => {
		fake.seed('_migrations/_lock', {
			lockedAt: new Date(NOW.getTime() - 2 * 60 * 1000).toISOString()
		});
		const up = vi.fn(async () => ({}));
		await expect(run([migration('0001-a', up)])).rejects.toBeInstanceOf(MigrationLockedError);
		expect(up).not.toHaveBeenCalled();
		expect(fake.peek('_migrations/_lock')).toBeDefined();
	});

	it('Scenario: Stale lock: a lock older than 30 minutes is taken over', async () => {
		fake.seed('_migrations/_lock', {
			lockedAt: new Date(NOW.getTime() - STALE_LOCK_MS - 1000).toISOString()
		});
		const result = await run([migration('0001-a')]);
		expect(result.applied).toEqual(['0001-a']);
		expect(fake.peek('_migrations/_lock')).toBeUndefined();
	});
});
