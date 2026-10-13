import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Migration } from './types';

export const MIGRATION_NAME = /^\d{4}-[a-z0-9]+(-[a-z0-9]+)*$/;

/** Every migration file in `dir`, as `NNNN-name.ts`, in sequence order. */
export function listMigrationFiles(dir: string): string[] {
	return readdirSync(dir)
		.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
		.sort();
}

/** Problems that make a set of migrations unsafe to run: bad names, duplicate numbers, no undo steps. */
export function validateMigrations(migrations: Migration[]): string[] {
	const problems: string[] = [];
	const numbers = new Map<string, string>();
	for (const m of migrations) {
		if (!MIGRATION_NAME.test(m.name)) {
			problems.push(`${m.name}: name must look like 0001-short-name`);
			continue;
		}
		const number = m.name.slice(0, 4);
		const other = numbers.get(number);
		if (other) problems.push(`${m.name}: number ${number} is also used by ${other}`);
		numbers.set(number, m.name);
		if (!m.description?.trim()) problems.push(`${m.name}: description is empty`);
		if (!m.undo?.trim()) problems.push(`${m.name}: undo steps are empty`);
		if (typeof m.up !== 'function') problems.push(`${m.name}: up() is missing`);
	}
	return problems;
}

/** Imports every migration in `dir`; each file's default export is its `Migration`. */
export async function loadMigrations(dir: string): Promise<Migration[]> {
	const migrations: Migration[] = [];
	for (const file of listMigrationFiles(dir)) {
		const mod = (await import(pathToFileURL(join(dir, file)).href)) as { default?: Migration };
		const migration = mod.default;
		if (!migration) throw new Error(`${file} has no default export`);
		if (migration.name !== file.replace(/\.ts$/, '')) {
			throw new Error(`${file} exports the name "${migration.name}"; it must match the file name`);
		}
		migrations.push(migration);
	}
	return migrations;
}
