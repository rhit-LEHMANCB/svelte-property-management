/** Why a sign-in failed, as far as the user needs to know. */
export type SignInFailure = 'credentials' | 'disabled' | 'throttled' | 'unavailable';

export const SIGN_IN_MESSAGES: Record<SignInFailure, string> = {
	credentials: 'Your email or password is incorrect.',
	disabled: 'This account has been disabled. Please contact Lehman Family LLC.',
	throttled: 'Too many sign-in attempts. Please wait a few minutes and try again.',
	unavailable: 'Sign-in is unavailable right now. Please try again.'
};

/**
 * Classifies a Firebase Auth error code from either the REST API (`USER_DISABLED`, possibly with a
 * ` : detail` suffix) or the client SDK (`auth/user-disabled`). Unknown codes are `unavailable`.
 */
export const classifySignInError = (code: string): SignInFailure => {
	if (/USER_DISABLED|auth\/user-disabled/.test(code)) return 'disabled';
	if (/TOO_MANY_ATTEMPTS_TRY_LATER|auth\/too-many-requests/.test(code)) return 'throttled';
	if (
		/INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS|INVALID_EMAIL|auth\/(invalid-credential|wrong-password|user-not-found|invalid-email)/.test(
			code
		)
	) {
		return 'credentials';
	}
	return 'unavailable';
};
