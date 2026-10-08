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
