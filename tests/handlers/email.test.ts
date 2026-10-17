import { beforeEach, describe, expect, it, vi } from 'vitest';

// This file tests the real email module and the reset endpoint on top of it; only Resend and the
// Firebase Admin double stay replaced. The global setup replaces the whole email module, so undo that here.
vi.unmock('$lib/server/email');

const resend = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({
	Resend: class {
		emails = { send: resend.send };
	}
}));

import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { sendPasswordResetEmail } from '$lib/server/email';
import { PUT as requestReset } from '../../src/routes/api/signin/reset/+server';
import { call } from '../helpers/callHandler';
import { services } from '../helpers/services';

// Firebase builds the link on the project's action URL, which may be a stale domain.
const LINK = 'https://old-domain.test/reset?mode=resetPassword&oobCode=abc';
const SENT_LINK = `${PUBLIC_FRONTEND_URL}/reset?mode=resetPassword&oobCode=abc`;
const SENT_LINK_HTML = SENT_LINK.replace(/&/g, '&amp;');

beforeEach(() => {
	resend.send.mockReset().mockResolvedValue({ data: { id: 'email-1' }, error: null });
	services.auth.generatePasswordResetLink.mockResolvedValue(LINK);
});

describe('authentication: password reset request (real email module)', () => {
	it('Scenario: Reset email sent asks Firebase for a link that continues at PUBLIC_FRONTEND_URL/', async () => {
		await sendPasswordResetEmail('tenant@example.com', false);

		expect(services.auth.generatePasswordResetLink).toHaveBeenCalledWith('tenant@example.com', {
			url: `${PUBLIC_FRONTEND_URL}/`
		});

		await sendPasswordResetEmail('new@example.com', true);

		expect(services.auth.generatePasswordResetLink).toHaveBeenCalledWith('new@example.com', {
			url: `${PUBLIC_FRONTEND_URL}/`
		});
	});

	it('Scenario: Reset email sent mails the generated link to the user', async () => {
		await sendPasswordResetEmail('tenant@example.com', false);

		expect(resend.send).toHaveBeenCalledOnce();
		const message = resend.send.mock.calls[0][0];
		expect(message.to).toBe('tenant@example.com');
		expect(message.html).toContain(SENT_LINK_HTML);
		expect(message.text).toContain(SENT_LINK);
		expect(message.html).not.toContain('old-domain.test');
	});

	it('Scenario: Email sender identity is Lehman Family LLC at support@lehmanfamilyllc.com with HTML and text bodies', async () => {
		await sendPasswordResetEmail('tenant@example.com', false);

		const message = resend.send.mock.calls[0][0];
		expect(message.from).toBe('Lehman Family LLC <support@lehmanfamilyllc.com>');
		expect(message.html).toBeTruthy();
		expect(message.text).toBeTruthy();
	});

	it('Scenario: Welcome email sent uses a different subject and body than the reset email', async () => {
		await sendPasswordResetEmail('a@example.com', false);
		await sendPasswordResetEmail('b@example.com', true);

		const [reset, welcome] = resend.send.mock.calls.map(([message]) => message);
		expect(welcome.subject).toBeTruthy();
		expect(welcome.subject).not.toBe(reset.subject);
		expect(welcome.html).not.toBe(reset.html);
		expect(welcome.html).toContain(SENT_LINK_HTML);
		expect(welcome.text).toContain(SENT_LINK);
	});

	it('Scenario: Email failure when link generation fails: nothing is sent and the endpoint responds 500', async () => {
		services.auth.generatePasswordResetLink.mockRejectedValue(new Error('user-not-found'));

		const result = await call(requestReset, {
			method: 'PUT',
			body: { email: 'ghost@example.com' }
		});

		expect(result.status).toBe(500);
		expect(resend.send).not.toHaveBeenCalled();
	});

	it('Scenario: Unknown email responds email_sent, sends nothing and logs no error', async () => {
		services.auth.generatePasswordResetLink.mockRejectedValue(
			Object.assign(new Error('There is no user record corresponding to the provided email.'), {
				code: 'auth/email-not-found'
			})
		);
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const result = await call(requestReset, {
			method: 'PUT',
			body: { email: 'ghost@example.com' }
		});

		expect(result).toMatchObject({ status: 200, json: { status: 'email_sent' } });
		expect(resend.send).not.toHaveBeenCalled();
		expect(logged).not.toHaveBeenCalled();
		logged.mockRestore();
	});

	it('Scenario: Email failure when the provider rejects the message responds 500', async () => {
		resend.send.mockRejectedValue(new Error('network down'));

		const result = await call(requestReset, {
			method: 'PUT',
			body: { email: 'tenant@example.com' }
		});

		expect(result.status).toBe(500);
	});

	it('Scenario: Email failure when the provider reports an error responds 500', async () => {
		resend.send.mockResolvedValue({
			data: null,
			error: { name: 'validation_error', message: 'domain not verified' }
		});

		const result = await call(requestReset, {
			method: 'PUT',
			body: { email: 'tenant@example.com' }
		});

		expect(result.status).toBe(500);
	});

	it('Scenario: Reset email sent responds { status: "email_sent" } through the real module', async () => {
		const result = await call(requestReset, {
			method: 'PUT',
			body: { email: 'tenant@example.com' }
		});

		expect(result).toMatchObject({ status: 200, json: { status: 'email_sent' } });
		expect(resend.send).toHaveBeenCalledOnce();
	});
});
