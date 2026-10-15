import { PUBLIC_FB_API_KEY } from '$env/static/public';
import { classifySignInError, type SignInFailure } from '$lib/authErrors';

// The Auth emulator exposes the same REST API on its own host (e2e tests run against it).
const endpoint = () => {
	const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
	const base = emulator
		? `http://${emulator}/identitytoolkit.googleapis.com`
		: 'https://identitytoolkit.googleapis.com';
	return `${base}/v1/accounts:signInWithPassword?key=${PUBLIC_FB_API_KEY}`;
};

export type PasswordCheck = { idToken: string } | { error: Exclude<SignInFailure, 'unavailable'> };

/**
 * Checks an email and password against Firebase Auth and returns a fresh ID token, or the reason
 * Firebase refused them (wrong credentials, disabled account, too many attempts). Other failures
 * (network, quota) throw. Never logs the password.
 */
export const verifyPassword = async (email: string, password: string): Promise<PasswordCheck> => {
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
		return { idToken: body.idToken };
	}

	const code = body.error?.message ?? '';
	const failure = classifySignInError(code);
	if (failure !== 'unavailable') {
		return { error: failure };
	}

	throw new Error(`Password check failed: ${code || response.status}`);
};
