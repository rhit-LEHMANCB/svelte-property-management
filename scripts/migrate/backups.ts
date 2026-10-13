import type { RestorePoint } from './types';

const API = 'https://firestore.googleapis.com/v1';

export class NoBackupScheduleError extends Error {
	constructor(projectId: string, database: string) {
		super(
			`Database ${database} in project ${projectId} has no backup schedule, so migrations will not run.\n` +
				'Create one in the Firebase console (Firestore > Disaster recovery > Create backup schedule): ' +
				'daily with 2-day retention and weekly with 8-day retention.'
		);
	}
}

type ScheduleList = { backupSchedules?: unknown[] };
type Backup = { name?: string; database?: string; state?: string; snapshotTime?: string };
type BackupList = { backups?: Backup[]; unreachable?: string[] };

/** Whether a `backupSchedules` list response holds at least one schedule. */
export function hasSchedule(response: ScheduleList): boolean {
	return (response.backupSchedules?.length ?? 0) > 0;
}

/** The newest finished (`READY`) backup of `database` in a `backups` list response, or null. */
export function pickRestorePoint(
	response: BackupList,
	projectId: string,
	database: string
): RestorePoint {
	const databasePath = `projects/${projectId}/databases/${database}`;
	const ready = (response.backups ?? []).filter(
		(b) => b.database === databasePath && b.state === 'READY' && b.name && b.snapshotTime
	);
	if (ready.length === 0) return null;
	const newest = ready.reduce((a, b) =>
		Date.parse(b.snapshotTime!) > Date.parse(a.snapshotTime!) ? b : a
	);
	return { backup: newest.name!, snapshotTime: newest.snapshotTime! };
}

/**
 * Refuses (throws) when the database has no backup schedule, and otherwise returns its newest
 * finished backup, or null when none has finished yet.
 */
export async function findRestorePoint(options: {
	projectId: string;
	database?: string;
	getAccessToken: () => Promise<string>;
	fetch?: typeof fetch;
}): Promise<RestorePoint> {
	const { projectId, getAccessToken } = options;
	const database = options.database ?? '(default)';
	const doFetch = options.fetch ?? fetch;
	const token = await getAccessToken();

	const get = async (path: string) => {
		const response = await doFetch(`${API}/${path}`, {
			headers: { authorization: `Bearer ${token}` }
		});
		if (!response.ok) {
			const body = await response.text().catch(() => '');
			throw new Error(
				`Could not read ${path} (HTTP ${response.status}). Check that the deploy service account ` +
					`can list Firestore backup schedules and backups. ${body.slice(0, 300)}`
			);
		}
		return response.json();
	};

	const schedules = (await get(
		`projects/${projectId}/databases/${database}/backupSchedules`
	)) as ScheduleList;
	if (!hasSchedule(schedules)) throw new NoBackupScheduleError(projectId, database);

	const backups = (await get(`projects/${projectId}/locations/-/backups`)) as BackupList;
	return pickRestorePoint(backups, projectId, database);
}
