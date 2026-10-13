import type { DocumentData, DocumentReference, Firestore } from 'firebase-admin/firestore';
import { validateMigrations } from './load';
import type { Migration, MigrationContext, MigrationWriter, RestorePoint } from './types';

export const MIGRATIONS_COLLECTION = '_migrations';
export const LOCK_ID = '_lock';
/** A lock older than this is assumed to belong to a run that died, and is taken over. */
export const STALE_LOCK_MS = 30 * 60 * 1000;

export class MigrationLockedError extends Error {
	constructor(lockedAt: string) {
		super(`Another migration run holds the lock (taken at ${lockedAt}); nothing was applied.`);
	}
}

export type RunOptions = {
	db: Firestore;
	migrations: Migration[];
	dryRun: boolean;
	/**
	 * Refuses (throws) when the database has no backup schedule; returns the newest backup, null when
	 * none has finished yet, or undefined when there is nothing to check (the emulator).
	 */
	findRestorePoint: () => Promise<RestorePoint | undefined>;
	log?: (message: string) => void;
	now?: () => Date;
};

export type RunResult = { applied: string[]; skipped: string[] };

function writerFor(dryRun: boolean, log: (m: string) => void): MigrationWriter {
	if (!dryRun) {
		return {
			set: async (ref, data, options) => {
				await (options ? ref.set(data, options) : ref.set(data));
			},
			delete: async (ref) => {
				await ref.delete();
			}
		};
	}
	return {
		set: async (ref, data, options) =>
			log(
				`  [dry run] would ${options?.merge ? 'merge into' : 'set'} ${ref.path}: ${JSON.stringify(data)}`
			),
		delete: async (ref) => log(`  [dry run] would delete ${ref.path}`)
	};
}

async function takeLock(db: Firestore, now: Date) {
	const lockRef = db.collection(MIGRATIONS_COLLECTION).doc(LOCK_ID) as DocumentReference;
	await db.runTransaction(async (tx) => {
		const lock = await tx.get(lockRef);
		const lockedAt = lock.data()?.lockedAt as string | undefined;
		if (lockedAt && now.getTime() - Date.parse(lockedAt) < STALE_LOCK_MS) {
			throw new MigrationLockedError(lockedAt);
		}
		tx.set(lockRef, { lockedAt: now.toISOString() });
	});
	return lockRef;
}

/**
 * Applies every migration not yet recorded as applied in `_migrations`, in name order, stopping at
 * the first failure. Before each one it records the start time and the restore point, so a human
 * knows which backup predates the change. A dry run writes nothing, not even the records.
 */
export async function runMigrations(options: RunOptions): Promise<RunResult> {
	const { db, dryRun } = options;
	const log = options.log ?? ((m: string) => console.log(m));
	const clock = options.now ?? (() => new Date());

	const problems = validateMigrations(options.migrations);
	if (problems.length > 0) throw new Error(`Invalid migrations:\n${problems.join('\n')}`);
	const migrations = [...options.migrations].sort((a, b) => a.name.localeCompare(b.name));

	const found = await options.findRestorePoint();
	const restorePoint = found ?? null;
	if (found === undefined) {
		log('Backup check skipped (emulator): there is no restore point.');
	} else if (found) {
		log(`Restore point: backup ${found.backup} (snapshot ${found.snapshotTime})`);
	} else {
		log(
			'WARNING: the database has a backup schedule but no finished backup yet; continuing with no restore point.'
		);
	}

	const lockRef = dryRun ? undefined : await takeLock(db, clock());
	const result: RunResult = { applied: [], skipped: [] };
	try {
		for (const migration of migrations) {
			const recordRef = db
				.collection(MIGRATIONS_COLLECTION)
				.doc(migration.name) as DocumentReference;
			if ((await recordRef.get()).data()?.status === 'applied') {
				result.skipped.push(migration.name);
				continue;
			}

			const startedAt = clock();
			log(`${migration.name}: starting at ${startedAt.toISOString()}${dryRun ? ' (dry run)' : ''}`);
			const record: DocumentData = {
				status: 'running',
				description: migration.description,
				startedAt: startedAt.toISOString(),
				restorePoint
			};
			if (!dryRun) await recordRef.set(record);

			const ctx: MigrationContext = {
				db,
				dryRun,
				now: startedAt,
				log: (m) => log(`  ${m}`),
				write: writerFor(dryRun, log)
			};
			try {
				const summary = await migration.up(ctx);
				log(`${migration.name}: done. ${JSON.stringify(summary)}`);
				if (!dryRun) {
					await recordRef.set({
						...record,
						status: 'applied',
						finishedAt: clock().toISOString(),
						summary
					});
				}
				result.applied.push(migration.name);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				log(`${migration.name}: FAILED: ${message}`);
				if (!dryRun) {
					await recordRef.set({
						...record,
						status: 'failed',
						finishedAt: clock().toISOString(),
						error: message
					});
				}
				throw err;
			}
		}
	} finally {
		if (lockRef) await lockRef.delete();
	}
	if (result.applied.length === 0) log('Nothing to migrate.');
	return result;
}
