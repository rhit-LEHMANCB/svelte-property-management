import { describe, expect, it } from 'vitest';
import { renderPasswordResetEmail, renderWelcomeEmail } from '$lib/server/email-templates';

const LINK = 'https://example.test/reset?mode=resetPassword&oobCode=a"b';

describe('authentication: email templates', () => {
	it('Scenario: reset and welcome emails differ in subject and body', () => {
		const reset = renderPasswordResetEmail(LINK);
		const welcome = renderWelcomeEmail(LINK);

		expect(reset.subject).not.toBe(welcome.subject);
		expect(reset.text).not.toBe(welcome.text);
		expect(reset.html).not.toBe(welcome.html);
	});

	it('Scenario: the plain-text body carries the link verbatim', () => {
		expect(renderPasswordResetEmail(LINK).text).toContain(LINK);
		expect(renderWelcomeEmail(LINK).text).toContain(LINK);
	});

	it('Scenario: the HTML body carries the link with attribute-unsafe characters escaped', () => {
		for (const { html } of [renderPasswordResetEmail(LINK), renderWelcomeEmail(LINK)]) {
			expect(html).toContain(
				'href="https://example.test/reset?mode=resetPassword&amp;oobCode=a&quot;b"'
			);
			expect(html).not.toContain('a"b');
		}
	});
});

describe('leases: New tenant accounts from a lease (welcome email)', () => {
	const lease = { address: '12 Elm St, Terre Haute', startDate: '2026-11-01' };

	it('Scenario: New email: the welcome email names the address and start date', () => {
		const { text, html, subject } = renderWelcomeEmail(LINK, lease);
		expect(subject).toBe('Welcome to Lehman Family LLC');
		expect(text).toContain('Your lease at 12 Elm St, Terre Haute starts on November 1, 2026.');
		expect(html).toContain('Your lease at 12 Elm St, Terre Haute starts on November 1, 2026.');
		expect(text).toContain(LINK);
	});

	it('names the company as Lehman Family LLC and no other name', () => {
		const { text, html } = renderWelcomeEmail(LINK, lease);
		for (const body of [text, html]) {
			expect(body).toContain('Lehman Family LLC');
			expect(body).not.toMatch(/Lehman (Family )?Realty/);
		}
	});

	it('escapes the address in the HTML body', () => {
		const { html } = renderWelcomeEmail(LINK, { ...lease, address: '<b>5 Oak</b> & Co' });
		expect(html).toContain('&lt;b&gt;5 Oak&lt;/b&gt; &amp; Co');
		expect(html).not.toContain('<b>5 Oak</b>');
	});

	it('without a lease the welcome email has no lease sentence', () => {
		expect(renderWelcomeEmail(LINK).text).not.toContain('Your lease');
	});
});
