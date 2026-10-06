import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const firstNumber = (text: string) => Number.parseInt(/\d+/.exec(text)?.[0] ?? '0', 10);

// Node.js 20 is decommissioned for Cloud Functions on 2026-10-30; app-platform spec: supported runtime.
const MINIMUM_NODE = 22;

describe('app-platform: supported server runtime', () => {
	const nvmrcMajor = firstNumber(read('.nvmrc'));
	const { engines } = JSON.parse(read('package.json')) as { engines?: { node?: string } };

	it('pins CI and local development to a supported Node version in .nvmrc', () => {
		expect(nvmrcMajor).toBeGreaterThanOrEqual(MINIMUM_NODE);
	});

	it('declares the Cloud Function runtime in package.json engines, matching .nvmrc', () => {
		expect(engines?.node).toBeDefined();
		expect(firstNumber(engines?.node ?? '')).toBe(nvmrcMajor);
	});

	it('keeps the custom theme the app shell selects with data-theme', () => {
		expect(read('src/app.html')).toContain('data-theme="my-custom-theme"');
		expect(read('src/theme.css')).toContain("[data-theme='my-custom-theme']");
	});
});
