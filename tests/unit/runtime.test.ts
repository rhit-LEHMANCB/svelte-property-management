import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

// Node.js 20 is decommissioned for Cloud Functions on 2026-10-30; app-platform spec: supported runtime.
const MINIMUM_NODE = 22;

describe('app-platform: supported server runtime', () => {
	it('pins CI and local development to a supported Node version in .nvmrc', () => {
		const major = Number.parseInt(read('.nvmrc').trim(), 10);
		expect(major).toBeGreaterThanOrEqual(MINIMUM_NODE);
	});

	it('declares the Cloud Function runtime in package.json engines', () => {
		const { engines } = JSON.parse(read('package.json')) as { engines?: { node?: string } };
		expect(engines?.node).toBeDefined();
		expect(Number.parseInt(engines?.node ?? '0', 10)).toBeGreaterThanOrEqual(MINIMUM_NODE);
	});
});
