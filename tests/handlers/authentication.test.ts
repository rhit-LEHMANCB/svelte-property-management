import { describe, expect, it } from 'vitest';
import { DELETE, POST } from '../../src/routes/api/signin/+server';
import { PUT } from '../../src/routes/api/signin/reset/+server';
import { handle } from '../../src/hooks.server';
import { load as resetLoad } from '../../src/routes/(ignorebase)/reset/+page.server';
import { actions as forgotActions } from '../../src/routes/(ignorebase)/forgot/+page.server';
import {
	actions as signInActions,
	load as signInLoad
} from '../../src/routes/(ignorebase)/signin/+page.server';
import { call } from '../helpers/callHandler';
import { services, VALID_PASSWORD } from '../helpers/services';

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

	it('Scenario: Malformed ID token responds 401 "Invalid ID token" and sets no cookie', async () => {
		services.auth.verifyIdToken.mockRejectedValue(new Error('Decoding Firebase ID token failed'));

		const result = await call(POST, { body: { idToken: 'not-a-token' } });

		expect(result).toMatchObject({ status: 401, error: 'Invalid ID token' });
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
		expect(result.error).not.toContain('email provider down');
	});

	it('Scenario: Unknown email responds { status: "email_sent" } and sends nothing', async () => {
		services.sendPasswordResetEmail.mockRejectedValue(
			Object.assign(new Error('no user'), { code: 'auth/email-not-found' })
		);

		const result = await call(PUT, { method: 'PUT', body: { email: 'nobody@example.com' } });

		expect(result).toMatchObject({ status: 200, json: { status: 'email_sent' } });
	});

	it('Scenario: a rate-limited request responds { status: "email_sent" } without sending', async () => {
		await call(PUT, { method: 'PUT', body: { email: 'tenant@example.com' } });

		const result = await call(PUT, { method: 'PUT', body: { email: 'tenant@example.com' } });

		expect(result).toMatchObject({ status: 200, json: { status: 'email_sent' } });
		expect(services.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
	});

	it('rejects a body that is not JSON with 400', async () => {
		const result = await call(PUT, {
			method: 'PUT',
			rawBody: 'not json',
			headers: { 'content-type': 'application/json' }
		});

		expect(result.status).toBe(400);
		expect(services.sendPasswordResetEmail).not.toHaveBeenCalled();
	});

	it.each(['not-an-email', 'x'.repeat(300), 42])(
		'rejects an invalid email (%j) with 400 before touching the rate limit',
		async (email) => {
			const result = await call(PUT, { method: 'PUT', body: { email } });

			expect(result.status).toBe(400);
			expect(services.sendPasswordResetEmail).not.toHaveBeenCalled();
			expect(services.db.listCollection('passwordResetRequests')).toEqual([]);
		}
	);

	it('rejects a request without an email with 400', async () => {
		const result = await call(PUT, { method: 'PUT', body: {} });

		expect(result.status).toBe(400);
		expect(services.sendPasswordResetEmail).not.toHaveBeenCalled();
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

	it('Scenario: /signin, /forgot and /reset are public even without a session', async () => {
		services.auth.verifySessionCookie.mockRejectedValue(new Error('none'));

		for (const path of ['/signin', '/forgot', '/reset']) {
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

describe('authentication: sign-in before hydration (signin page action)', () => {
	it('Scenario: Submit before hydration signs in on the server, sets the cookie and redirects to /', async () => {
		services.auth.verifyIdToken.mockResolvedValue({ uid: 'u1', auth_time: nowSeconds() - 5 });

		const result = await call(signInActions.default, {
			form: { email: 'a@example.com', password: VALID_PASSWORD }
		});

		expect(result).toMatchObject({ status: 303, redirect: '/' });
		expect(services.verifyPassword).toHaveBeenCalledWith('a@example.com', VALID_PASSWORD);
		expect(result.cookies.calls.set).toHaveLength(1);
		expect(result.cookies.calls.set[0]).toMatchObject({
			name: '__session',
			value: 'session-cookie-value',
			options: { httpOnly: true, secure: true, path: '/', maxAge: FIVE_DAYS_MS / 1000 }
		});
	});

	it('Scenario: Wrong credentials on the POST form show the error and keep the email', async () => {
		const result = await call(signInActions.default, {
			form: { email: 'a@example.com', password: 'wrong' }
		});

		expect(result.status).toBe(400);
		expect(result.data).toEqual({
			email: 'a@example.com',
			error: 'Your email or password is incorrect.'
		});
		expect(result.cookies.calls.set).toHaveLength(0);
	});

	it('Scenario: an empty form is rejected without calling Firebase', async () => {
		const result = await call(signInActions.default, { form: { email: '', password: '' } });

		expect(result.status).toBe(400);
		expect(services.verifyPassword).not.toHaveBeenCalled();
	});

	it('Scenario: a failing password check shows the unavailable message and sets no cookie', async () => {
		services.verifyPassword.mockRejectedValue(new Error('network down'));

		const result = await call(signInActions.default, {
			form: { email: 'a@example.com', password: VALID_PASSWORD }
		});

		expect(result.status).toBe(500);
		expect(result.data).toEqual({
			email: 'a@example.com',
			error: 'Sign-in is unavailable right now. Please try again.'
		});
		expect(result.cookies.calls.set).toHaveLength(0);
	});

	it.each([
		['disabled', 'This account has been disabled. Please contact Lehman Family LLC.'],
		['throttled', 'Too many sign-in attempts. Please wait a few minutes and try again.']
	])(
		'Scenario: Disabled or rate-limited account on the POST form (%s) shows its message and keeps the email',
		async (failure, message) => {
			services.verifyPassword.mockResolvedValue({ error: failure });

			const result = await call(signInActions.default, {
				form: { email: 'a@example.com', password: VALID_PASSWORD }
			});

			expect(result.status).toBe(400);
			expect(result.data).toEqual({ email: 'a@example.com', error: message });
			expect(result.cookies.calls.set).toHaveLength(0);
		}
	);

	it('Scenario: Session failure on the POST form shows the unavailable message, not a bare 500', async () => {
		services.auth.createSessionCookie.mockRejectedValue(new Error('admin SDK down'));

		const result = await call(signInActions.default, {
			form: { email: 'a@example.com', password: VALID_PASSWORD }
		});

		expect(result.status).toBe(500);
		expect(result.error).toBeUndefined();
		expect(result.data).toEqual({
			email: 'a@example.com',
			error: 'Sign-in is unavailable right now. Please try again.'
		});
		expect(result.cookies.calls.set).toHaveLength(0);
	});

	it('Scenario: a stale token from the password check shows the unavailable message', async () => {
		services.auth.verifyIdToken.mockResolvedValue({ uid: 'u1', auth_time: nowSeconds() - 600 });

		const result = await call(signInActions.default, {
			form: { email: 'a@example.com', password: VALID_PASSWORD }
		});

		expect(result.status).toBe(500);
		expect(result.data.error).toBe('Sign-in is unavailable right now. Please try again.');
		expect(result.cookies.calls.set).toHaveLength(0);
	});
});

describe('authentication: sign-in page after a password reset (signin page load)', () => {
	it('Scenario: Continue after a reset shows the password-changed notice', async () => {
		const result = await call(signInLoad, { url: 'http://localhost/signin?reset=success' });

		expect(result.data).toEqual({ passwordChanged: true });
	});

	it('shows no notice on a plain visit', async () => {
		const result = await call(signInLoad, { url: 'http://localhost/signin' });

		expect(result.data).toEqual({ passwordChanged: false });
	});
});

describe('authentication: forgot password page (forgot page action)', () => {
	const GENERIC = { requested: true };

	it('Scenario: Request from the sign-in page sends the reset email and shows the generic answer', async () => {
		const result = await call(forgotActions.default, { form: { email: ' tenant@example.com ' } });

		expect(result).toMatchObject({ status: 200, data: GENERIC });
		expect(services.sendPasswordResetEmail).toHaveBeenCalledWith('tenant@example.com', false);
	});

	it('Scenario: Same answer for unknown emails', async () => {
		services.sendPasswordResetEmail.mockRejectedValue(
			Object.assign(new Error('no user'), { code: 'auth/email-not-found' })
		);

		const result = await call(forgotActions.default, { form: { email: 'nobody@example.com' } });

		expect(result).toMatchObject({ status: 200, data: GENERIC });
	});

	it('Scenario: Same answer for a rate-limited email, and nothing more is sent', async () => {
		await call(forgotActions.default, { form: { email: 'tenant@example.com' } });

		const result = await call(forgotActions.default, { form: { email: 'tenant@example.com' } });

		expect(result).toMatchObject({ status: 200, data: GENERIC });
		expect(services.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
	});

	it.each(['', 'not-an-email'])(
		'Scenario: Empty or invalid email (%j) asks for a valid email and requests nothing',
		async (email) => {
			const result = await call(forgotActions.default, { form: { email } });

			expect(result.status).toBe(400);
			expect(result.data).toEqual({ email, field: 'email', error: 'Please enter a valid email.' });
			expect(services.sendPasswordResetEmail).not.toHaveBeenCalled();
		}
	);

	it('Scenario: Delivery failure shows the retry message and keeps the email', async () => {
		services.sendPasswordResetEmail.mockRejectedValue(new Error('email provider down'));

		const result = await call(forgotActions.default, { form: { email: 'tenant@example.com' } });

		expect(result.status).toBe(500);
		expect(result.data).toEqual({
			email: 'tenant@example.com',
			error: "We couldn't send the email right now. Please try again."
		});
	});
});

describe('authentication: password reset completion (reset page load)', () => {
	it('Scenario: Valid link passes the code to the page with an empty form', async () => {
		const result = await call(resetLoad, {
			url: 'http://localhost/reset?mode=resetPassword&oobCode=code-1&continueUrl=https%3A%2F%2Fevil.test%2F'
		});

		expect(result.status).toBe(200);
		expect(result.data.oobCode).toBe('code-1');
		expect(result.data.form).toBeDefined();
		expect(JSON.stringify(result.data)).not.toContain('evil.test');
	});

	it('Scenario: Wrong mode responds 400 "Invalid action"', async () => {
		const result = await call(resetLoad, {
			url: 'http://localhost/reset?mode=verifyEmail&oobCode=abc'
		});

		expect(result).toMatchObject({ status: 400, error: 'Invalid action' });
	});

	it('Scenario: Missing code responds 400 "Invalid action"', async () => {
		const result = await call(resetLoad, { url: 'http://localhost/reset?mode=resetPassword' });

		expect(result).toMatchObject({ status: 400, error: 'Invalid action' });
	});
});
