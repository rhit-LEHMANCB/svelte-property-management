import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	listMigrationFiles,
	loadMigrations,
	MIGRATION_NAME,
	validateMigrations
} from '../../scripts/migrate/load';
import type { Migration } from '../../scripts/migrate/types';

// data-migrations: Migration files. Every committed migration is named, numbered and undoable.
const dir = fileURLToPath(new URL('../../migrations', import.meta.url));
const ok = (name: string): Migration => ({
	name,
	description: 'Does a thing.',
	undo: 'Undo the thing.',
	up: async () => ({})
});

describe('committed migrations', () => {
	it('every file is named NNNN-short-name.ts', () => {
		for (const file of listMigrationFiles(dir)) {
			expect(file.replace(/\.ts$/, '')).toMatch(MIGRATION_NAME);
		}
	});

	it('load, and pass validation: unique numbers, a description and undo steps', async () => {
		const migrations = await loadMigrations(dir);
		expect(migrations.length).toBe(listMigrationFiles(dir).length);
		expect(validateMigrations(migrations)).toEqual([]);
	});
});

describe('validateMigrations', () => {
	it('accepts a good set', () => {
		expect(validateMigrations([ok('0001-a'), ok('0002-b-c')])).toEqual([]);
	});

	it('Scenario: Missing undo steps fails', () => {
		expect(validateMigrations([{ ...ok('0001-a'), undo: '' }])).toEqual([
			'0001-a: undo steps are empty'
		]);
	});

	it('flags bad names, reused numbers and empty descriptions', () => {
		expect(
			validateMigrations([
				ok('1-a'),
				ok('0002-a'),
				ok('0002-b'),
				{ ...ok('0003-c'), description: '' }
			])
		).toEqual([
			'1-a: name must look like 0001-short-name',
			'0002-b: number 0002 is also used by 0002-a',
			'0003-c: description is empty'
		]);
	});
});
