import { describe, expect, it } from 'vitest';
import { DELETE, POST } from '../../src/routes/api/signin/+server';
import { PUT } from '../../src/routes/api/signin/reset/+server';
import { handle } from '../../src/hooks.server';
import { call } from '../helpers/callHandler';
import { services } from '../helpers/services';

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('authentication: session establishment (POST /api/signin)', () => {
	it('Scenario: Successful sign-in sets an httpOnly, secure __session cookie from a 5-day session cookie', async () => {
		services.auth.verifyIdToken.mockResolvedValue({ uid: 'u1', auth_time: nowSeconds() - 30 });

		const result = await call(POST, { body: { idToken: 'good-token' } });

		expect(result).toMatchObject({ status: 200, json: { status: 'signedIn' } });
		expect(services.auth.createSessionCookie).toHaveBeenCalledWith('good-token', {
			expiresIn: FIVE_DAYS_MS
		});
		expect(result.cookies.calls.set).toHaveLength(1);
		const [cookie] = result.cookies.calls.set;
		expect(cookie.name).toBe('__session');
		expect(cookie.value).toBe('session-cookie-value');
		expect(cookie.options).toMatchObject({ httpOnly: true, secure: true, path: '/' });
		expect(cookie.options.maxAge).toBe(FIVE_DAYS_MS / 1000);
	});

	it('Scenario: Stale ID token responds 401 "Recent sign in required!" and sets no cookie', async () => {
		services.auth.verifyIdToken.mockResolvedValue({ uid: 'u1', auth_time: nowSeconds() - 5 * 60 });

		const result = await call(POST, { body: { idToken: 'old-token' } });

		expect(result).toMatchObject({ status: 401, error: 'Recent sign in required!' });
		expect(result.cookies.calls.set).toHaveLength(0);
		expect(services.auth.createSessionCookie).not.toHaveBeenCalled();
	});

	it('Scenario: a token just under 5 minutes old is still accepted', async () => {
		services.auth.verifyIdToken.mockResolvedValue({ uid: 'u1', auth_time: nowSeconds() - 4 * 60 });

		const result = await call(POST, { body: { idToken: 't' } });

		expect(result.status).toBe(200);
	});
});

describe('authentication: sign-out (DELETE /api/signin)', () => {
	it('Scenario: Sign-out removes the cookie and responds { status: "signedOut" }', async () => {
		const result = await call(DELETE, { method: 'DELETE', cookies: { __session: 'abc' } });

		expect(result).toMatchObject({ status: 200, json: { status: 'signedOut' } });
		expect(result.cookies.calls.deleted).toEqual([{ name: '__session', options: { path: '/' } }]);
	});
});

describe('authentication: password reset request (PUT /api/signin/reset)', () => {
	it('Scenario: Reset email sent responds { status: "email_sent" } and sends the reset (not welcome) email', async () => {
		const result = await call(PUT, { method: 'PUT', body: { email: 'tenant@example.com' } });

		expect(result).toMatchObject({ status: 200, json: { status: 'email_sent' } });
		expect(services.sendPasswordResetEmail).toHaveBeenCalledWith('tenant@example.com', false);
	});

	it('Scenario: Email failure responds 500', async () => {
		services.sendPasswordResetEmail.mockRejectedValue(new Error('email provider down'));

		const result = await call(PUT, { method: 'PUT', body: { email: 'tenant@example.com' } });

		expect(result.status).toBe(500);
	});
});

describe('authentication: route protection (hooks.server handle)', () => {
	const run = async (pathname: string, cookie?: string) => {
		const locals: { userID: string | null } = { userID: 'stale' };
		let resolved = false;
		const event = {
			url: new URL(`http://localhost${pathname}`),
			cookies: { get: () => cookie },
			locals
		};
		try {
			await handle({
				event,
				resolve: async () => {
					resolved = true;
					return new Response('ok');
				}
			} as never);
		} catch (e) {
			return { locals, resolved, redirect: e as { status: number; location: string } };
		}
		return { locals, resolved, redirect: undefined };
	};

	it('Scenario: a valid session sets locals.userID to the verified uid', async () => {
		services.auth.verifySessionCookie.mockResolvedValue({ uid: 'tenant-7' });

		const result = await run('/maintenance', 'good-cookie');

		expect(result.locals.userID).toBe('tenant-7');
		expect(result.resolved).toBe(true);
		expect(services.auth.verifySessionCookie).toHaveBeenCalledWith('good-cookie');
	});

	it('Scenario: Unauthenticated page request is redirected 303 to /signin', async () => {
		services.auth.verifySessionCookie.mockRejectedValue(new Error('expired'));

		const result = await run('/maintenance', 'expired-cookie');

		expect(result.redirect).toMatchObject({ status: 303, location: '/signin' });
		expect(result.resolved).toBe(false);
	});

	it('Scenario: a missing cookie on a page request is redirected to /signin', async () => {
		services.auth.verifySessionCookie.mockRejectedValue(new Error('no cookie'));

		const result = await run('/admin/users');

		expect(result.redirect).toMatchObject({ status: 303, location: '/signin' });
		expect(services.auth.verifySessionCookie).toHaveBeenCalledWith('');
	});

	it('Scenario: /signin and /reset are public even without a session', async () => {
		services.auth.verifySessionCookie.mockRejectedValue(new Error('none'));

		for (const path of ['/signin', '/reset']) {
			const result = await run(path);
			expect(result.redirect).toBeUndefined();
			expect(result.resolved).toBe(true);
			expect(result.locals.userID).toBeNull();
		}
	});

	it('Scenario: API requests are not redirected, and carry a null userID when unauthenticated', async () => {
		services.auth.verifySessionCookie.mockRejectedValue(new Error('none'));

		const result = await run('/api/user/add');

		expect(result.redirect).toBeUndefined();
		expect(result.resolved).toBe(true);
		expect(result.locals.userID).toBeNull();
	});
});
