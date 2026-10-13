import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mailboxKey, requestPasswordReset } from '../../src/lib/server/passwordReset';
import { services } from '../helpers/services';

const unknownAccount = () =>
	Object.assign(new Error('There is no user record corresponding to the provided email.'), {
		code: 'auth/email-not-found'
	});

describe('authentication: password reset rate limit (requestPasswordReset)', () => {
	it('sends the first request for an address', async () => {
		await expect(requestPasswordReset('tenant@example.com')).resolves.toBe('sent');

		expect(services.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
		expect(services.sendPasswordResetEmail).toHaveBeenCalledWith('tenant@example.com', false);
	});

	it('Scenario: Second request within a minute sends only one email', async () => {
		await requestPasswordReset('tenant@example.com');

		await expect(requestPasswordReset('tenant@example.com')).resolves.toBe('suppressed');
		expect(services.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
	});

	it('Scenario: Case-insensitive address counts Tenant@Example.com and tenant@example.com together', async () => {
		await requestPasswordReset('Tenant@Example.com');

		await expect(requestPasswordReset(' tenant@example.com ')).resolves.toBe('suppressed');
		expect(services.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
	});

	it('Scenario: Variants of one mailbox (plus tags, Gmail dots) count as the same address', async () => {
		await requestPasswordReset('tenant+one@example.com');
		await expect(requestPasswordReset('tenant+two@example.com')).resolves.toBe('suppressed');

		await requestPasswordReset('first.last@gmail.com');
		await expect(requestPasswordReset('firstlast+x@googlemail.com')).resolves.toBe('suppressed');

		expect(services.sendPasswordResetEmail).toHaveBeenCalledTimes(2);
		// The email still goes to the address as typed.
		expect(services.sendPasswordResetEmail).toHaveBeenCalledWith('tenant+one@example.com', false);
	});

	it.each([
		['Tenant@Example.com', 'tenant@example.com'],
		['a.b+tag@example.com', 'a.b@example.com'],
		['A.B+tag@GMail.com', 'ab@gmail.com'],
		['a.b@googlemail.com', 'ab@gmail.com']
	])('mailboxKey(%s) is %s', (email, key) => {
		expect(mailboxKey(email)).toBe(key);
	});

	it('does not limit a different address', async () => {
		await requestPasswordReset('tenant@example.com');

		await expect(requestPasswordReset('other@example.com')).resolves.toBe('sent');
	});

	it('Scenario: Sixth request within an hour is not sent', async () => {
		const doc = limitDocPath('tenant@example.com');
		const now = Date.now();
		// Five requests in the last hour, the newest two minutes ago.
		services.db.seed(doc, {
			requests: [50, 40, 30, 20, 2].map((minutes) => now - minutes * 60 * 1000)
		});

		await expect(requestPasswordReset('tenant@example.com')).resolves.toBe('suppressed');
		expect(services.sendPasswordResetEmail).not.toHaveBeenCalled();
	});

	it('allows a request again once the older ones are more than an hour old', async () => {
		const doc = limitDocPath('tenant@example.com');
		const now = Date.now();
		services.db.seed(doc, {
			requests: [90, 80, 70, 65, 2].map((minutes) => now - minutes * 60 * 1000)
		});
		// Only the request two minutes ago is still within the hour, and it is over a minute old.

		await expect(requestPasswordReset('tenant@example.com')).resolves.toBe('sent');
		const kept = services.db.peek(doc)?.requests as number[];
		expect(kept).toHaveLength(2);
		expect(kept[0]).toBe(now - 2 * 60 * 1000);
		expect(kept[1]).toBeGreaterThanOrEqual(now);
	});

	it('stores a hash of the lowercased address, never the address itself', async () => {
		await requestPasswordReset('Tenant@Example.com');

		const doc = limitDocPath('tenant@example.com');
		expect(doc).toMatch(/^passwordResetRequests\/[0-9a-f]{64}$/);
		expect(services.db.peek(doc)?.requests).toHaveLength(1);
		expect(JSON.stringify(services.db.peek(doc))).not.toContain('example.com');
	});

	it('Scenario: Unknown email is suppressed, and still counts against the limit', async () => {
		services.sendPasswordResetEmail.mockRejectedValue(unknownAccount());

		await expect(requestPasswordReset('nobody@example.com')).resolves.toBe('suppressed');
		await expect(requestPasswordReset('nobody@example.com')).resolves.toBe('suppressed');
		expect(services.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
	});

	it('Scenario: Unknown email on a project with email enumeration protection sends nothing', async () => {
		// There, link generation for an unknown address fails with an internal error, so the
		// account lookup is what has to recognize it.
		services.auth.getUserByEmail.mockRejectedValue(
			Object.assign(
				new Error('There is no user record corresponding to the provided identifier.'),
				{
					code: 'auth/user-not-found'
				}
			)
		);
		services.sendPasswordResetEmail.mockRejectedValue(
			Object.assign(new Error('INTERNAL ASSERT FAILED: Unable to create the email action link'), {
				code: 'auth/internal-error'
			})
		);

		await expect(requestPasswordReset('nobody@example.com')).resolves.toBe('suppressed');
		expect(services.sendPasswordResetEmail).not.toHaveBeenCalled();
		expect(services.db.peek(limitDocPath('nobody@example.com'))?.requests).toHaveLength(1);
	});

	it('a failing account lookup (not an unknown account) is thrown and releases the slot', async () => {
		services.auth.getUserByEmail.mockRejectedValue(
			Object.assign(new Error('backend down'), { code: 'auth/internal-error' })
		);

		await expect(requestPasswordReset('tenant@example.com')).rejects.toThrow('backend down');
		expect(services.sendPasswordResetEmail).not.toHaveBeenCalled();
		expect(services.db.peek(limitDocPath('tenant@example.com'))).toBeUndefined();
	});

	it('Scenario: Email failure is thrown to the caller', async () => {
		services.sendPasswordResetEmail.mockRejectedValue(new Error('email provider down'));

		await expect(requestPasswordReset('tenant@example.com')).rejects.toThrow('email provider down');
	});

	it('a failed delivery does not use up the limit, so an immediate retry sends', async () => {
		services.sendPasswordResetEmail.mockRejectedValueOnce(new Error('email provider down'));
		await requestPasswordReset('tenant@example.com').catch(() => undefined);

		await expect(requestPasswordReset('tenant@example.com')).resolves.toBe('sent');
		expect(services.sendPasswordResetEmail).toHaveBeenCalledTimes(2);
		expect(services.db.peek(limitDocPath('tenant@example.com'))?.requests).toHaveLength(1);
	});

	it('leaves no rate-limit document behind when the only request failed to send', async () => {
		services.sendPasswordResetEmail.mockRejectedValue(new Error('email provider down'));

		await requestPasswordReset('tenant@example.com').catch(() => undefined);

		expect(services.db.peek(limitDocPath('tenant@example.com'))).toBeUndefined();
	});
});

/** Where the rate limit for an address is stored. */
const limitDocPath = (email: string) =>
	`passwordResetRequests/${createHash('sha256').update(email).digest('hex')}`;
