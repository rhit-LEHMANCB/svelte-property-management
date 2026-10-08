import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyPassword } from '$lib/server/verifyPassword';

const respond = (status: number, body: unknown) =>
	vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => {
	delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
});

describe('verifyPassword', () => {
	it('returns the ID token when Firebase accepts the credentials', async () => {
		const fetchMock = respond(200, { idToken: 'fresh-token' });
		vi.stubGlobal('fetch', fetchMock);

		await expect(verifyPassword('a@example.com', 'pw')).resolves.toBe('fresh-token');

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(
			'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test-api-key'
		);
		expect(JSON.parse(init.body)).toEqual({
			email: 'a@example.com',
			password: 'pw',
			returnSecureToken: true
		});
	});

	it.each(['INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'INVALID_LOGIN_CREDENTIALS'])(
		'returns null for %s',
		async (code) => {
			vi.stubGlobal('fetch', respond(400, { error: { message: code } }));

			await expect(verifyPassword('a@example.com', 'wrong')).resolves.toBeNull();
		}
	);

	it('throws on other failures without echoing the password', async () => {
		vi.stubGlobal('fetch', respond(500, { error: { message: 'BACKEND_ERROR' } }));

		const error = await verifyPassword('a@example.com', 'secret-pw').catch((e) => e);

		expect(error).toBeInstanceOf(Error);
		expect(String(error.message)).not.toContain('secret-pw');
	});

	it('talks to the Auth emulator when its host is set', async () => {
		process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
		const fetchMock = respond(200, { idToken: 't' });
		vi.stubGlobal('fetch', fetchMock);

		await verifyPassword('a@example.com', 'pw');

		expect(fetchMock.mock.calls[0][0]).toBe(
			'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test-api-key'
		);
	});
});
