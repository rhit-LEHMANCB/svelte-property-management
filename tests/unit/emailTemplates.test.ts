import { describe, expect, it } from 'vitest';
import {
	renderDueReminderEmail,
	renderLateFeeEmail,
	renderPasswordResetEmail,
	renderWelcomeEmail
} from '$lib/server/email-templates';

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

describe('billing-jobs: email templates', () => {
	it('late-fee notice names the month, fee, address and balance, and links to /payment', () => {
		const email = renderLateFeeEmail({
			address: '1 Main St, Terre Haute',
			monthLabel: 'November 2026',
			feeCents: 7500,
			totalOwedCents: 57500,
			link: 'https://example.test/payment'
		});
		expect(email.subject).toBe('Late fee added for November 2026');
		for (const part of [email.text, email.html]) {
			expect(part).toContain('$75.00');
			expect(part).toContain('$575.00');
			expect(part).toContain('1 Main St, Terre Haute');
			expect(part).toContain('https://example.test/payment');
			expect(part).toContain('Lehman Family LLC');
		}
	});

	const rent = {
		what: 'Rent for November 2026',
		amountCents: 150000,
		dueDate: '2026-11-01',
		dueToday: false
	};
	const reminder = (items: Parameters<typeof renderDueReminderEmail>[0]['items']) =>
		renderDueReminderEmail({ address: '1 Main St', items, link: 'https://example.test/payment' });

	it('a single reminder says "on <date>" seven days ahead and "today" on the due date', () => {
		const ahead = reminder([rent]);
		expect(ahead.subject).toBe('Rent for November 2026 is due on November 1, 2026');
		expect(ahead.html).not.toContain('<ul');
		const today = reminder([{ ...rent, dueToday: true }]);
		expect(today.subject).toBe('Rent for November 2026 is due today');
		expect(today.text).toContain('$1,500.00 is still to be paid');
	});

	it('several reminders are one email listing each amount and the total', () => {
		const deposit = {
			what: 'Security deposit',
			amountCents: 100000,
			dueDate: '2026-11-15',
			dueToday: false
		};
		const prorated = { ...rent, amountCents: 80000, dueDate: '2026-11-15' };
		const email = reminder([deposit, prorated]);
		expect(email.subject).toBe('Payments due on November 15, 2026');
		expect(email.text).toContain('$1,800.00 is still to be paid in total');
		expect(email.text).toContain('- Security deposit: $1,000.00, due on November 15, 2026');
		expect(email.text).toContain('- Rent for November 2026: $800.00, due on November 15, 2026');
		expect(email.html).toContain(
			'<li>Rent for November 2026: $800.00, due on November 15, 2026</li>'
		);
		expect(email.html).toContain('Lehman Family LLC');
	});

	it('the subject names the earliest due date, and the list is in due-date order', () => {
		// A lease starting Oct 25: October is due today, November in 7 days.
		const october = {
			what: 'Rent for October 2026',
			amountCents: 34000,
			dueDate: '2026-10-25',
			dueToday: true
		};
		const email = reminder([rent, october]);
		expect(email.subject).toBe('Payments due today');
		expect(email.text.indexOf('Rent for October 2026')).toBeLessThan(
			email.text.indexOf('Rent for November 2026')
		);
		expect(email.text).toContain('Rent for October 2026: $340.00, due today');
	});

	it('escapes the address and the listed items in the HTML', () => {
		const email = renderDueReminderEmail({
			address: '<b>1 Main</b>',
			items: [rent, { ...rent, what: '<i>x</i>' }],
			link: 'https://example.test/payment'
		});
		expect(email.html).not.toContain('<b>1 Main</b>');
		expect(email.html).toContain('&lt;b&gt;1 Main&lt;/b&gt;');
		expect(email.html).toContain('&lt;i&gt;x&lt;/i&gt;');
	});
});
