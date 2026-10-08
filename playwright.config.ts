import { generateKeyPairSync } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
import {
	APP_PORT,
	APP_URL,
	FAKE_STRIPE_PORT,
	FAKE_STRIPE_URL,
	PROJECT_ID
} from './tests/e2e/support/constants';

// `npm run test:qa` sets PLAYWRIGHT_QA: it targets the deployed dev site, so it starts no server
// and no emulators and does no seeding.
const isQa =
	process.env.PLAYWRIGHT_QA === '1' ||
	process.argv.includes('--project=qa') ||
	process.argv.some((arg, i) => arg === '--project' && process.argv[i + 1] === 'qa');

const DEV_QA_URL = 'https://lehman-realty-dev.web.app';

if (isQa) {
	// QA accounts live in the gitignored .env.qa unless the variables are already set. It is loaded
	// before the BASE_URL check below, so a BASE_URL kept in that file is checked too.
	if (typeof process.loadEnvFile !== 'function') {
		throw new Error('QA runs need Node 22 or newer (run `nvm use`).');
	}
	try {
		process.loadEnvFile('.env.qa');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw new Error(`Could not read .env.qa: ${(error as Error).message}`, { cause: error });
		}
		// No file: the variables must come from the environment.
	}
}

// QA signs in with real dev accounts, so it must never be pointed at production. This runs whenever
// the config loads, not only for `npm run test:qa`, because BASE_URL only ever feeds the qa project.
const allowedHosts = ['lehman-realty-dev.web.app', 'localhost', '127.0.0.1'];
const requested = process.env.BASE_URL?.trim();
if (requested) {
	let host: string;
	try {
		host = new URL(requested).hostname;
	} catch {
		throw new Error(
			'BASE_URL must be a full URL such as https://lehman-realty-dev.web.app (or a local server).'
		);
	}
	if (!allowedHosts.includes(host)) {
		throw new Error(
			`BASE_URL must be the dev site or a local server (allowed: ${allowedHosts.join(', ')}).`
		);
	}
}

const qaBaseUrl = process.env.BASE_URL?.trim() || DEV_QA_URL;

// The e2e app signs sessions with a throwaway key generated on every run, so no key is committed.
const { privateKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	publicKeyEncoding: { type: 'spki', format: 'pem' }
});

// Every variable the app imports is set explicitly, so nothing from a developer's .env or from CI
// secrets can leak into an end-to-end run.
const appEnv = {
	PUBLIC_FB_API_KEY: 'e2e-api-key',
	PUBLIC_FB_APP_ID: 'e2e-app-id',
	PUBLIC_FB_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
	PUBLIC_FB_MEASUREMENT_ID: 'G-E2E',
	PUBLIC_FB_MESSAGING_SENDER_ID: '0',
	PUBLIC_FB_PROJECT_ID: PROJECT_ID,
	PUBLIC_FB_STORAGE_BUCKET: `${PROJECT_ID}.appspot.com`,
	PUBLIC_FRONTEND_URL: APP_URL,
	FB_CLIENT_EMAIL: `e2e@${PROJECT_ID}.iam.gserviceaccount.com`,
	FB_PRIVATE_KEY: JSON.stringify({ privateKey }),
	RESEND_API_KEY: 're_e2e',
	STRIPE_API_KEY: 'sk_test_e2e',
	STRIPE_ENDPOINT_SECRET: 'whsec_e2e',
	STRIPE_API_BASE_URL: FAKE_STRIPE_URL,
	GCLOUD_PROJECT: PROJECT_ID
};

export default defineConfig({
	fullyParallel: false,
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
	use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
	globalSetup: isQa ? undefined : './tests/e2e/support/global-setup.ts',
	webServer: isQa
		? undefined
		: [
				{
					command: 'node tests/e2e/support/fake-stripe.mjs',
					port: FAKE_STRIPE_PORT,
					env: { FAKE_STRIPE_PORT: String(FAKE_STRIPE_PORT) },
					reuseExistingServer: !process.env.CI
				},
				{
					// A production build served by `vite preview`: no dependency re-bundling or page reloads,
					// and it exercises the built output. `--mode e2e` turns on the Auth emulator hook.
					command: `npx vite build --mode e2e && npx vite preview --mode e2e --host 127.0.0.1 --port ${APP_PORT} --strictPort`,
					url: `${APP_URL}/signin`,
					env: appEnv,
					timeout: 300_000,
					reuseExistingServer: false
				}
			],
	projects: [
		{
			name: 'e2e',
			testDir: './tests/e2e/specs',
			use: { ...devices['Desktop Chrome'], baseURL: APP_URL }
		},
		{
			name: 'qa',
			testDir: './tests/qa',
			use: {
				...devices['Desktop Chrome'],
				baseURL: qaBaseUrl,
				// Traces and video record what is typed, which would include the QA account passwords.
				trace: 'off',
				video: 'off'
			}
		}
	]
});
