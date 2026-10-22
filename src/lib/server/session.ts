import { error, type Cookies } from '@sveltejs/kit';
import { adminAuth } from './admin';

const TOKEN_ERROR_CODES = new Set([
	'auth/argument-error',
	'auth/invalid-id-token',
	'auth/id-token-expired',
	'auth/id-token-revoked'
]);

const EXPIRES_IN = 60 * 60 * 24 * 5 * 1000; // 5 days

/** Exchanges a freshly issued Firebase ID token for the httpOnly `__session` cookie. */
export const setSessionCookie = async (cookies: Cookies, idToken: string) => {
	const decodedIdToken = await adminAuth.verifyIdToken(idToken).catch((err) => {
		// Only a bad token is the client's fault; certificate fetch or credential failures stay 500.
		if (TOKEN_ERROR_CODES.has(err?.code)) throw error(401, 'Invalid ID token');
		throw err;
	});

	if (new Date().getTime() / 1000 - decodedIdToken.auth_time >= 5 * 60) {
		throw error(401, 'Recent sign in required!');
	}

	const cookie = await adminAuth.createSessionCookie(idToken, { expiresIn: EXPIRES_IN });
	// maxAge is in seconds; expiresIn is in milliseconds.
	cookies.set('__session', cookie, {
		maxAge: EXPIRES_IN / 1000,
		httpOnly: true,
		secure: true,
		path: '/'
	});
};
