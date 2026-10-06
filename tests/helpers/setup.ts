import { beforeEach, vi } from 'vitest';
import { services } from './services';

// Handler tests never reach Firebase, Stripe or SendGrid: the server modules are replaced by
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

beforeEach(() => services.reset());
