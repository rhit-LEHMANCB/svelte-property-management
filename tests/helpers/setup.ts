import http from 'node:http';
import https from 'node:https';
import { beforeEach, vi } from 'vitest';
import { services } from './services';

// Handler tests never reach Firebase, Stripe or the email provider: the server modules are replaced by
// the doubles in ./services. Vitest applies the mocks below to every test file.
vi.mock('$lib/server/admin', async () => {
	const { services } = await import('./services');
	return { adminDB: services.db, adminAuth: services.auth, adminStorage: services.storage };
});
vi.mock('firebase-admin/firestore', async () => import('./firestoreModule'));
vi.mock('$lib/server/stripe', async () => {
	const { services } = await import('./services');
	return { stripe: services.stripe };
});
vi.mock('$lib/server/email', async () => {
	const { services } = await import('./services');
	return { sendPasswordResetEmail: services.sendPasswordResetEmail };
});

vi.mock('$lib/server/verifyPassword', async () => {
	const { services } = await import('./services');
	return { verifyPassword: services.verifyPassword };
});

beforeEach(() => services.reset());

// Handler tests must never reach the network. A handler that bypassed the doubles above and called
// fetch or an HTTP client would fail loudly here instead of silently contacting a real service.
const blocked = (what: string) => () => {
	throw new Error(`Network access is blocked in handler tests (${what})`);
};
vi.stubGlobal('fetch', blocked('fetch'));
http.request = blocked('http.request') as never;
http.get = blocked('http.get') as never;
https.request = blocked('https.request') as never;
https.get = blocked('https.get') as never;
