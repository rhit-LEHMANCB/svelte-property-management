export type EmailContent = { subject: string; html: string; text: string };

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

const layout = (heading: string, intro: string, buttonLabel: string, link: string) => {
	const href = escapeHtml(link);
	return `<!doctype html>
<html>
	<body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
		<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
			<tr>
				<td align="center">
					<table role="presentation" width="480" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:8px;padding:32px;">
						<tr>
							<td>
								<h1 style="margin:0 0 16px;font-size:22px;">${escapeHtml(heading)}</h1>
								<p style="margin:0 0 24px;font-size:16px;line-height:1.5;">${escapeHtml(intro)}</p>
								<p style="margin:0 0 24px;"><a href="${href}" style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;">${escapeHtml(buttonLabel)}</a></p>
								<p style="margin:0 0 8px;font-size:13px;color:#52525b;">If the button does not work, copy this link into your browser:</p>
								<p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${href}">${href}</a></p>
								<p style="margin:0;font-size:13px;color:#52525b;">Lehman Family LLC</p>
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>`;
};

export const renderPasswordResetEmail = (link: string): EmailContent => ({
	subject: 'Reset your password',
	html: layout(
		'Reset your password',
		'We received a request to reset your Lehman Family LLC password. Use the button below to choose a new one. If you did not ask for this, you can ignore this email.',
		'Reset password',
		link
	),
	text: `Reset your password

We received a request to reset your Lehman Family LLC password. Open the link below to choose a new one. If you did not ask for this, you can ignore this email.

${link}

Lehman Family LLC`
});

/** The lease a new tenant was created for, named in their welcome email. */
export type WelcomeLease = { address: string; startDate: string };

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** `2026-11-01` -> `November 1, 2026`, without passing through a time zone. */
const longDate = (isoDate: string) => {
	const [year, month, day] = isoDate.split('-').map(Number);
	return `${MONTHS[month - 1]} ${day}, ${year}`;
};

export const renderWelcomeEmail = (link: string, lease?: WelcomeLease): EmailContent => {
	const leaseLine = lease
		? ` Your lease at ${lease.address} starts on ${longDate(lease.startDate)}.`
		: '';
	return {
		subject: 'Welcome to Lehman Family LLC',
		html: layout(
			'Welcome to Lehman Family LLC',
			`An account has been created for you.${leaseLine} Use the button below to set your password and sign in.`,
			'Set your password',
			link
		),
		text: `Welcome to Lehman Family LLC

An account has been created for you.${leaseLine} Open the link below to set your password and sign in.

${link}

Lehman Family LLC`
	};
};

const money = (cents: number) =>
	(cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** A late fee the daily billing job charged. */
export type LateFeeNotice = {
	address: string;
	/** `November 2026` */
	monthLabel: string;
	feeCents: number;
	totalOwedCents: number;
	link: string;
};

export const renderLateFeeEmail = (notice: LateFeeNotice): EmailContent => {
	const intro = `A late fee of ${money(notice.feeCents)} was added to your lease at ${notice.address} because the rent for ${notice.monthLabel} was not paid in full by the end of the grace period. Your balance is now ${money(notice.totalOwedCents)}.`;
	return {
		subject: `Late fee added for ${notice.monthLabel}`,
		html: layout(`Late fee for ${notice.monthLabel}`, intro, 'Make a payment', notice.link),
		text: `Late fee for ${notice.monthLabel}

${intro}

Pay online: ${notice.link}

Lehman Family LLC`
	};
};

/** A rent month or deposit coming due (in 7 days) or due today. */
export type DueReminder = {
	address: string;
	/** `Rent for November 2026` or `Security deposit` */
	what: string;
	amountCents: number;
	dueDate: string;
	dueToday: boolean;
	link: string;
};

export const renderDueReminderEmail = (reminder: DueReminder): EmailContent => {
	const when = reminder.dueToday ? 'today' : `on ${longDate(reminder.dueDate)}`;
	const subject = `${reminder.what} is due ${when}`;
	const intro = `${reminder.what} for your lease at ${reminder.address} is due ${when}. ${money(reminder.amountCents)} is still to be paid.`;
	return {
		subject,
		html: layout(subject, intro, 'Make a payment', reminder.link),
		text: `${subject}

${intro}

Pay online: ${reminder.link}

Lehman Family LLC`
	};
};
