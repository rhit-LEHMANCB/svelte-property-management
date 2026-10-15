import type { DocumentData, DocumentReference, Firestore } from 'firebase-admin/firestore';

/**
 * Writes made through `ctx.write` are logged instead of applied in a dry run, so a migration cannot
 * forget to honor `--dry-run`. Reads go straight to `ctx.db`.
 */
export type MigrationWriter = {
	set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): Promise<void>;
	delete(ref: DocumentReference): Promise<void>;
};

export type MigrationContext = {
	db: Firestore;
	dryRun: boolean;
	/** The moment the run started; use it instead of `new Date()` so a run is consistent. */
	now: Date;
	log: (message: string) => void;
	write: MigrationWriter;
};

/** What a migration reports; stored on its `_migrations` record. */
export type MigrationSummary = Record<string, unknown>;

export type Migration = {
	/** File name without extension: `NNNN-short-name`. */
	name: string;
	description: string;
	/** How a human undoes this migration, in plain steps. */
	undo: string;
	up(ctx: MigrationContext): Promise<MigrationSummary>;
};

/** The newest finished backup of the database, to restore from if a migration goes wrong. */
export type RestorePoint = { backup: string; snapshotTime: string } | null;
