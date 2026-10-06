import { beforeEach, describe, expect, it, vi } from 'vitest';

// This file tests the real email module and the reset endpoint on top of it; only SendGrid and the
// Firebase Admin double stay replaced. The global setup replaces the whole email module, so undo that here.
vi.unmock('#lib/server/email');

const sendgrid = vi.hoisted(() => ({
	setApiKey: vi.fn(),
	send: vi.fn()
}));
vi.mock('@sendgrid/mail', () => ({ default: sendgrid }));

import { PUBLIC_FRONTEND_URL } from '$app/env/public';
import { sendPasswordResetEmail } from '#lib/server/email';
import { PUT as requestReset } from '../../src/routes/api/signin/reset/+server';
import { call } from '../helpers/callHandler';
import { services } from '../helpers/services';

beforeEach(() => {
	sendgrid.setApiKey.mockReset();
	sendgrid.send.mockReset().mockResolvedValue([{ statusCode: 202 }]);
});

describe('authentication: password reset request (real email module)', () => {
	it('Scenario: Reset email sent asks Firebase for a link that continues at PUBLIC_FRONTEND_URL/', async () => {
		await sendPasswordResetEmail('tenant@example.com', false);

		expect(services.auth.generatePasswordResetLink).toHaveBeenCalledWith('tenant@example.com', {
			url: `${PUBLIC_FRONTEND_URL}/`
		});
	});

	it('Scenario: Reset email sent mails the generated link to the user', async () => {
		services.auth.generatePasswordResetLink.mockResolvedValue('https://reset.test/?oobCode=abc');

		await sendPasswordResetEmail('tenant@example.com', false);

		expect(sendgrid.send).toHaveBeenCalledOnce();
		const message = sendgrid.send.mock.calls[0][0];
		expect(message.to).toBe('tenant@example.com');
		expect(message.dynamicTemplateData).toEqual({ link: 'https://reset.test/?oobCode=abc' });
	});

	it('Scenario: the welcome email and the reset email use different templates', async () => {
		await sendPasswordResetEmail('a@example.com', false);
		await sendPasswordResetEmail('b@example.com', true);

		const [reset, welcome] = sendgrid.send.mock.calls.map(([message]) => message.templateId);
		expect(reset).toBeTruthy();
		expect(welcome).toBeTruthy();
		expect(welcome).not.toBe(reset);
	});

	it('Scenario: Email failure when link generation fails: nothing is sent and the endpoint responds 500', async () => {
		services.auth.generatePasswordResetLink.mockRejectedValue(new Error('user-not-found'));

		const result = await call(requestReset, {
			method: 'PUT',
			body: { email: 'ghost@example.com' }
		});

		expect(result.status).toBe(500);
		expect(sendgrid.send).not.toHaveBeenCalled();
	});

	it('Scenario: Email failure when SendGrid rejects the message responds 500', async () => {
		sendgrid.send.mockRejectedValue(new Error('SendGrid down'));

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
		expect(sendgrid.send).toHaveBeenCalledOnce();
	});
});
