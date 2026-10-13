import { describe, expect, it } from 'vitest';
import { classifySignInError, SIGN_IN_MESSAGES } from '$lib/authErrors';

describe('classifySignInError', () => {
	it.each([
		['USER_DISABLED', 'disabled'],
		['USER_DISABLED : The user account has been disabled by an administrator.', 'disabled'],
		['auth/user-disabled', 'disabled'],
		['TOO_MANY_ATTEMPTS_TRY_LATER', 'throttled'],
		[
			'TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled',
			'throttled'
		],
		['auth/too-many-requests', 'throttled'],
		['INVALID_PASSWORD', 'credentials'],
		['EMAIL_NOT_FOUND', 'credentials'],
		['INVALID_LOGIN_CREDENTIALS', 'credentials'],
		['INVALID_EMAIL', 'credentials'],
		['auth/invalid-credential', 'credentials'],
		['auth/wrong-password', 'credentials'],
		['auth/user-not-found', 'credentials'],
		['auth/invalid-email', 'credentials'],
		['BACKEND_ERROR', 'unavailable'],
		['auth/network-request-failed', 'unavailable'],
		['', 'unavailable']
	])('%s is %s', (code, expected) => {
		expect(classifySignInError(code)).toBe(expected);
	});

	it('has the wording the authentication spec requires', () => {
		expect(SIGN_IN_MESSAGES).toEqual({
			credentials: 'Your email or password is incorrect.',
			disabled: 'This account has been disabled. Please contact Lehman Family LLC.',
			throttled: 'Too many sign-in attempts. Please wait a few minutes and try again.',
			unavailable: 'Sign-in is unavailable right now. Please try again.'
		});
	});
});
