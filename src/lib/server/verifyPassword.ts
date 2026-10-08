import { PUBLIC_FB_API_KEY } from '$env/static/public';

// The Auth emulator exposes the same REST API on its own host (e2e tests run against it).
const endpoint = () => {
	const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
	const base = emulator
		? `http://${emulator}/identitytoolkit.googleapis.com`
		: 'https://identitytoolkit.googleapis.com';
	return `${base}/v1/accounts:signInWithPassword?key=${PUBLIC_FB_API_KEY}`;
};

/**
 * Checks an email and password against Firebase Auth and returns a fresh ID token, or null when
 * the credentials are wrong. Other failures (network, quota) throw. Never logs the password.
 */
export const verifyPassword = async (email: string, password: string) => {
	const response = await fetch(endpoint(), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password, returnSecureToken: true })
	});
	const body = (await response.json().catch(() => ({}))) as {
		idToken?: string;
		error?: { message?: string };
	};

	if (response.ok && body.idToken) {
		return body.idToken;
	}

	const code = body.error?.message ?? '';
	if (/INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS|INVALID_EMAIL/.test(code)) {
		return null;
	}

	throw new Error(`Password check failed: ${code || response.status}`);
};
