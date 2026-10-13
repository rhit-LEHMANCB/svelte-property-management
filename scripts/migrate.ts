// Applies pending data migrations from `migrations/` to one Firebase project's Firestore.
// Usage: npm run migrate [-- --dry-run]. See README.md, "Data migrations".
import { fileURLToPath } from 'node:url';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { findRestorePoint } from './migrate/backups';
import { loadMigrations } from './migrate/load';
import { runMigrations } from './migrate/runner';

const USAGE = `Usage: npm run migrate [-- --dry-run]

Applies every migration in migrations/ that is not yet recorded in the _migrations collection.

  --dry-run   Print what would change without writing anything.
  --help      Show this message.

Environment:
  FB_PROJECT_ID                   Firebase project to migrate (required).
  GOOGLE_APPLICATION_CREDENTIALS  Service account key file (or other Application Default Credentials).
  FIRESTORE_EMULATOR_HOST         Run against the emulator; the backup check is skipped.`;

async function main() {
	const args = process.argv.slice(2);
	if (args.includes('--help')) {
		console.log(USAGE);
		return;
	}
	const unknown = args.filter((a) => a !== '--dry-run');
	if (unknown.length > 0) throw new Error(`Unknown option ${unknown[0]}\n\n${USAGE}`);
	const dryRun = args.includes('--dry-run');

	const projectId = process.env.FB_PROJECT_ID;
	if (!projectId) throw new Error(`FB_PROJECT_ID is not set.\n\n${USAGE}`);
	const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

	const credential = emulator ? undefined : applicationDefault();
	initializeApp({ projectId, ...(credential && { credential }) });

	const migrations = await loadMigrations(fileURLToPath(new URL('../migrations', import.meta.url)));
	console.log(
		`Migrating project ${projectId}${emulator ? ' (emulator)' : ''}${dryRun ? ' as a dry run' : ''}; ${migrations.length} migration(s) found.`
	);

	await runMigrations({
		db: getFirestore(),
		migrations,
		dryRun,
		findRestorePoint: emulator
			? async () => null
			: () =>
					findRestorePoint({
						projectId,
						getAccessToken: async () => (await credential!.getAccessToken()).access_token
					})
	});
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
