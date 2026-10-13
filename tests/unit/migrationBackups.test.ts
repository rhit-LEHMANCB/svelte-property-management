import { describe, expect, it, vi } from 'vitest';
import {
	findRestorePoint,
	hasSchedule,
	NoBackupScheduleError,
	pickRestorePoint
} from '../../scripts/migrate/backups';

// data-migrations: Backup schedule required and Restore point, from the Firestore Admin API responses.
const DB = 'projects/p/databases/(default)';

describe('pickRestorePoint', () => {
	it('picks the newest READY backup of the database', () => {
		expect(
			pickRestorePoint(
				{
					backups: [
						{ name: 'b-old', database: DB, state: 'READY', snapshotTime: '2026-10-11T03:00:00Z' },
						{ name: 'b-new', database: DB, state: 'READY', snapshotTime: '2026-10-12T03:00:00Z' },
						{
							name: 'b-running',
							database: DB,
							state: 'CREATING',
							snapshotTime: '2026-10-13T03:00:00Z'
						},
						{
							name: 'b-other-db',
							database: 'projects/p/databases/other',
							state: 'READY',
							snapshotTime: '2026-10-13T04:00:00Z'
						}
					]
				},
				'p',
				'(default)'
			)
		).toEqual({ backup: 'b-new', snapshotTime: '2026-10-12T03:00:00Z' });
	});

	it('returns null when only unfinished backups exist, or none at all', () => {
		expect(
			pickRestorePoint(
				{
					backups: [
						{ name: 'b', database: DB, state: 'CREATING', snapshotTime: '2026-10-13T03:00:00Z' }
					]
				},
				'p',
				'(default)'
			)
		).toBeNull();
		expect(pickRestorePoint({}, 'p', '(default)')).toBeNull();
	});
});

describe('hasSchedule', () => {
	it('is true only when at least one schedule is listed', () => {
		expect(hasSchedule({ backupSchedules: [{ name: 's' }] })).toBe(true);
		expect(hasSchedule({ backupSchedules: [] })).toBe(false);
		expect(hasSchedule({})).toBe(false);
	});
});

describe('findRestorePoint', () => {
	const respond = (schedules: unknown, backups: unknown, status = 200) =>
		vi.fn(async (url: string, _init?: RequestInit) => {
			const body = url.endsWith('/backupSchedules') ? schedules : backups;
			return new Response(JSON.stringify(body), { status });
		});

	it('Scenario: Schedule present: returns the newest finished backup, with a bearer token', async () => {
		const fetchMock = respond(
			{ backupSchedules: [{ name: 's' }] },
			{
				backups: [
					{ name: 'b1', database: DB, state: 'READY', snapshotTime: '2026-10-12T03:00:00Z' }
				]
			}
		);
		const point = await findRestorePoint({
			projectId: 'p',
			getAccessToken: async () => 'tok',
			fetch: fetchMock as unknown as typeof fetch
		});
		expect(point).toEqual({ backup: 'b1', snapshotTime: '2026-10-12T03:00:00Z' });
		expect(fetchMock.mock.calls[0][0]).toBe(
			'https://firestore.googleapis.com/v1/projects/p/databases/(default)/backupSchedules'
		);
		expect(fetchMock.mock.calls[1][0]).toBe(
			'https://firestore.googleapis.com/v1/projects/p/locations/-/backups'
		);
		expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { authorization: 'Bearer tok' } });
	});

	it('Scenario: No schedule: refuses with instructions to create one', async () => {
		const run = findRestorePoint({
			projectId: 'p',
			getAccessToken: async () => 'tok',
			fetch: respond({}, {}) as unknown as typeof fetch
		});
		await expect(run).rejects.toBeInstanceOf(NoBackupScheduleError);
		await expect(run).rejects.toThrow(/Disaster recovery/);
	});

	it('Scenario: No backup yet: a schedule with only unfinished backups gives null', async () => {
		const point = await findRestorePoint({
			projectId: 'p',
			getAccessToken: async () => 'tok',
			fetch: respond({ backupSchedules: [{}] }, { backups: [] }) as unknown as typeof fetch
		});
		expect(point).toBeNull();
	});

	it('a failed request names the permission to check and the HTTP status', async () => {
		await expect(
			findRestorePoint({
				projectId: 'p',
				getAccessToken: async () => 'tok',
				fetch: respond({ error: 'denied' }, {}, 403) as unknown as typeof fetch
			})
		).rejects.toThrow(/HTTP 403.*list Firestore backup schedules/s);
	});
});
