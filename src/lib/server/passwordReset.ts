import { createHash } from 'node:crypto';
import { adminDB } from './admin';
import { sendPasswordResetEmail } from './email';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_PER_HOUR = 5;

/** `sent`: the email went out. `suppressed`: no account, or over the rate limit; nothing was sent. */
export type ResetOutcome = 'sent' | 'suppressed';

// Keyed by a hash so the collection never holds raw addresses. Only the Admin SDK reads it.
const limitDoc = (email: string) =>
	adminDB
		.collection('passwordResetRequests')
		.doc(createHash('sha256').update(email.trim().toLowerCase()).digest('hex'));

/**
 * Records a reset request for the address and says whether it may send: at most one per minute and
 * five per hour. Counted before the account lookup, so unknown addresses are limited the same way.
 */
const allowResetRequest = (email: string, now = Date.now()) =>
	adminDB.runTransaction(async (tx) => {
		const ref = limitDoc(email);
		const stored = ((await tx.get(ref)).data()?.requests ?? []) as number[];
		const recent = stored.filter((time) => now - time < HOUR_MS);
		if (recent.length >= MAX_PER_HOUR || recent.some((time) => now - time < MINUTE_MS)) {
			return false;
		}
		tx.set(ref, { requests: [...recent, now] });
		return true;
	});

// The Admin SDK reports an unknown address on reset links as `auth/email-not-found`.
const UNKNOWN_ACCOUNT = new Set(['auth/email-not-found', 'auth/user-not-found']);
const isUnknownUser = (err: unknown) =>
	UNKNOWN_ACCOUNT.has(String((err as { code?: unknown } | null)?.code));

/**
 * Sends a password reset email unless the address has no account or is over the rate limit. Callers
 * must answer `sent` and `suppressed` the same way so the result does not reveal who has an account.
 * Throws when the email cannot be delivered.
 */
export const requestPasswordReset = async (email: string): Promise<ResetOutcome> => {
	if (!(await allowResetRequest(email))) {
		return 'suppressed';
	}
	try {
		await sendPasswordResetEmail(email, false);
	} catch (err) {
		if (isUnknownUser(err)) {
			return 'suppressed';
		}
		throw err;
	}
	return 'sent';
};
