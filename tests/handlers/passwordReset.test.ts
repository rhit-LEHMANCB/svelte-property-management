import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { requestPasswordReset } from '../../src/lib/server/passwordReset';
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
		expect(services.db.peek(doc)?.requests).toHaveLength(2);
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
});

/** Where the rate limit for an address is stored. */
const limitDocPath = (email: string) =>
	`passwordResetRequests/${createHash('sha256').update(email).digest('hex')}`;
