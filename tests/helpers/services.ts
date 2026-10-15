import { vi } from 'vitest';
import { FakeFirestore } from './fakeFirestore';
import { STRIPE_ENDPOINT_SECRET } from '$env/static/private';

/**
 * The doubles that replace Firebase Admin, Stripe and the email provider in handler tests. They are
 * singletons that the module mocks in `setup.ts` hand out; `reset()` runs before every test.
 */
export const VALID_STRIPE_SIGNATURE = 'valid-signature';

const db = new FakeFirestore();

const auth = {
	createUser: vi.fn(),
	deleteUser: vi.fn(),
	updateUser: vi.fn(),
	verifyIdToken: vi.fn(),
	createSessionCookie: vi.fn(),
	verifySessionCookie: vi.fn(),
	generatePasswordResetLink: vi.fn(),
	getUserByEmail: vi.fn()
};

const storageLog = {
	written: [] as { path: string; bytes: Uint8Array; contentType?: string }[],
	/** What is in the bucket now, by path: written files, minus deleted ones. */
	files: new Map<string, Uint8Array>(),
	deleted: [] as string[],
	deletedPrefixes: [] as string[]
};

const bucket = {
	deleteFiles: vi.fn(),
	file: vi.fn()
};

const storage = { bucket: vi.fn(), log: storageLog };

const stripe = {
	customers: { create: vi.fn(), update: vi.fn(), del: vi.fn() },
	checkout: { sessions: { create: vi.fn() } },
	billingPortal: { sessions: { create: vi.fn() } },
	webhooks: { constructEvent: vi.fn() }
};

const sendPasswordResetEmail = vi.fn();
const sendEmail = vi.fn();

/** Stands in for the Firebase password check: only VALID_PASSWORD passes. */
export const VALID_PASSWORD = 'right-password';
const verifyPassword = vi.fn();

function reset() {
	db.reset();

	// The first account created is 'new-user-uid', later ones 'new-user-uid-2', 'new-user-uid-3'...
	let created = 0;
	auth.createUser.mockReset().mockImplementation(async ({ email }: { email: string }) => {
		created += 1;
		return { uid: created === 1 ? 'new-user-uid' : `new-user-uid-${created}`, email };
	});
	auth.deleteUser.mockReset().mockResolvedValue(undefined);
	auth.updateUser.mockReset().mockImplementation(async (uid: string) => ({ uid }));
	auth.verifyIdToken.mockReset().mockImplementation(async () => ({
		uid: 'user-1',
		auth_time: Math.floor(Date.now() / 1000)
	}));
	auth.createSessionCookie.mockReset().mockResolvedValue('session-cookie-value');
	auth.verifySessionCookie.mockReset().mockResolvedValue({ uid: 'user-1' });
	auth.getUserByEmail
		.mockReset()
		.mockImplementation(async (email: string) => ({ uid: 'user-by-email', email }));
	auth.generatePasswordResetLink
		.mockReset()
		.mockImplementation(async (email: string) => `https://reset.test/?email=${email}`);

	storageLog.written.length = 0;
	storageLog.deleted.length = 0;
	storageLog.deletedPrefixes.length = 0;
	storageLog.files.clear();
	bucket.deleteFiles.mockReset().mockImplementation(async ({ prefix }: { prefix: string }) => {
		storageLog.deletedPrefixes.push(prefix);
		for (const path of [...storageLog.files.keys()]) {
			if (path.startsWith(prefix)) storageLog.files.delete(path);
		}
	});
	bucket.file.mockReset().mockImplementation((path: string) => ({
		delete: async () => {
			storageLog.deleted.push(path);
			storageLog.files.delete(path);
		},
		createWriteStream: () => ({
			end: (bytes: Uint8Array) => {
				storageLog.written.push({ path, bytes });
				storageLog.files.set(path, bytes);
			}
		}),
		save: async (bytes: Uint8Array, options?: { contentType?: string }) => {
			storageLog.written.push({ path, bytes, contentType: options?.contentType });
			storageLog.files.set(path, bytes);
		},
		exists: async () => [storageLog.files.has(path)],
		download: async () => {
			const bytes = storageLog.files.get(path);
			if (!bytes) throw Object.assign(new Error('No such object'), { code: 404 });
			return [Buffer.from(bytes)];
		}
	}));
	storage.bucket.mockReset().mockReturnValue(bucket);

	stripe.customers.create
		.mockReset()
		.mockImplementation(async (args: object) => ({ id: 'cus_new', ...args }));
	stripe.customers.update.mockReset().mockResolvedValue({});
	stripe.customers.del.mockReset().mockResolvedValue({ deleted: true });
	stripe.checkout.sessions.create
		.mockReset()
		.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.test/session' });
	stripe.billingPortal.sessions.create
		.mockReset()
		.mockResolvedValue({ url: 'https://portal.test/session' });
	// Mimics Stripe's signature check: only VALID_STRIPE_SIGNATURE passes, and the payload is JSON.
	stripe.webhooks.constructEvent
		.mockReset()
		.mockImplementation((payload: Buffer, signature: string, secret: string) => {
			if (signature !== VALID_STRIPE_SIGNATURE || secret !== STRIPE_ENDPOINT_SECRET) {
				throw new Error('No signatures found matching the expected signature for payload');
			}
			return JSON.parse(Buffer.from(payload).toString());
		});

	sendPasswordResetEmail.mockReset().mockResolvedValue(undefined);
	sendEmail.mockReset().mockResolvedValue(undefined);
	verifyPassword
		.mockReset()
		.mockImplementation(async (_email: string, password: string) =>
			password === VALID_PASSWORD ? { idToken: 'fresh-id-token' } : { error: 'credentials' }
		);
}

reset();

/**
 * A `getUserByEmail` that behaves like Firebase Auth over the seeded data: an account exists for an
 * email when a user document has it, in any case. Tests that need real lookups install it with
 * `services.auth.getUserByEmail.mockImplementation(lookUpSeededUserByEmail)`.
 */
export async function lookUpSeededUserByEmail(email: string) {
	const users = await db.collection('users').get();
	const match = users.docs.find(
		(doc) => String(doc.data()?.email ?? '').toLowerCase() === email.toLowerCase()
	);
	if (!match) {
		throw Object.assign(new Error('There is no user record for this email.'), {
			code: 'auth/user-not-found'
		});
	}
	return { uid: match.id, email };
}

export const services = {
	db,
	auth,
	storage,
	stripe,
	sendPasswordResetEmail,
	sendEmail,
	verifyPassword,
	reset
};
