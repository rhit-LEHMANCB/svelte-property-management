import { RESEND_API_KEY } from '$env/static/private';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { Resend } from 'resend';
import { adminAuth } from './admin';
import { renderPasswordResetEmail, renderWelcomeEmail, type EmailContent } from './email-templates';

export const EMAIL_FROM = 'Lehman Family LLC <support@lehmanfamilyllc.com>';

export type EmailMessage = EmailContent & { to: string };

let client: Resend | undefined;

// The only place that knows which provider delivers mail. Resend reports failures in `error`
// instead of throwing, so turn them into a rejection that callers already handle as a 500.
export const sendEmail = async (message: EmailMessage): Promise<void> => {
	client ??= new Resend(RESEND_API_KEY);
	const { error } = await client.emails.send({ from: EMAIL_FROM, ...message });
	if (error) {
		throw new Error(`Email delivery failed: ${error.name}: ${error.message}`);
	}
};

export const sendPasswordResetEmail = async (email: string, isWelcomeEmail: boolean) => {
	const actionCodeSettings = {
		// URL you want to redirect back to. The domain (www.example.com) for
		// this URL must be whitelisted in the Firebase Console.
		url: `${PUBLIC_FRONTEND_URL}/`
	};

	let link: string;
	try {
		link = await adminAuth.generatePasswordResetLink(email, actionCodeSettings);
	} catch (error) {
		console.error('Problem generating password reset link', error);
		throw error;
	}

	const content = isWelcomeEmail ? renderWelcomeEmail(link) : renderPasswordResetEmail(link);
	await sendEmail({ to: email, ...content });
};
