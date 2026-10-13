import { createHash } from 'node:crypto';
import { adminAuth, adminDB } from './admin';
import { sendPasswordResetEmail } from './email';
import { isUnknownAccountError } from '$lib/authErrors';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_PER_HOUR = 5;

/** `sent`: the email went out. `suppressed`: no account, or over the rate limit; nothing was sent. */
export type ResetOutcome = 'sent' | 'suppressed';

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * The mailbox an address delivers to, so variants of one inbox share a limit: lowercased, without a
 * `+tag`, and for Gmail without dots in the local part.
 */
export const mailboxKey = (email: string) => {
	const address = email.trim().toLowerCase();
	const at = address.lastIndexOf('@');
	if (at < 1) return address;
	let local = address.slice(0, at).split('+')[0];
	const domain = address.slice(at + 1);
	if (GMAIL_DOMAINS.has(domain)) local = local.replaceAll('.', '');
	return `${local}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`;
};

// Keyed by a hash so the collection never holds raw addresses. Only the Admin SDK reads it.
const limitDoc = (email: string) =>
	adminDB
		.collection('passwordResetRequests')
		.doc(createHash('sha256').update(mailboxKey(email)).digest('hex'));

/**
 * Records a reset request for the address and says whether it may send: at most one per minute and
 * five per hour. Counted before the account lookup, so unknown addresses are limited the same way.
 * Returns the recorded time, or null when the request is over the limit.
 */
const recordResetRequest = (email: string, now = Date.now()) =>
	adminDB.runTransaction(async (tx) => {
		const ref = limitDoc(email);
		const stored = ((await tx.get(ref)).data()?.requests ?? []) as number[];
		const recent = stored.filter((time) => now - time < HOUR_MS);
		if (recent.length >= MAX_PER_HOUR || recent.some((time) => now - time < MINUTE_MS)) {
			return null;
		}
		tx.set(ref, { requests: [...recent, now] });
		return now;
	});

/** Gives back a recorded request whose email was never delivered, so the user can retry at once. */
const forgetResetRequest = (email: string, time: number) =>
	adminDB.runTransaction(async (tx) => {
		const ref = limitDoc(email);
		const stored = ((await tx.get(ref)).data()?.requests ?? []) as number[];
		const remaining = stored.filter((recorded) => recorded !== time);
		if (remaining.length) {
			tx.set(ref, { requests: remaining });
		} else {
			tx.delete(ref);
		}
	});

/**
 * Sends a password reset email unless the address has no account or is over the rate limit. Callers
 * must answer `sent` and `suppressed` the same way so the result does not reveal who has an account.
 * Throws when the email cannot be delivered.
 */
export const requestPasswordReset = async (email: string): Promise<ResetOutcome> => {
	const recorded = await recordResetRequest(email);
	if (recorded === null) {
		return 'suppressed';
	}
	try {
		// Asked first because, with email enumeration protection on, Firebase does not report an
		// unknown address when generating the link: it answers without a link and the Admin SDK
		// raises an internal error instead.
		await adminAuth.getUserByEmail(email);
		await sendPasswordResetEmail(email, false);
	} catch (err) {
		// An unknown address keeps its slot, so it is counted exactly like a real one. Link generation
		// can still report one if the account is deleted between the lookup and the send.
		if (isUnknownAccountError(err)) {
			return 'suppressed';
		}
		await forgetResetRequest(email, recorded).catch((undoError) =>
			console.error('Problem releasing a reset rate-limit slot', undoError)
		);
		throw err;
	}
	return 'sent';
};
