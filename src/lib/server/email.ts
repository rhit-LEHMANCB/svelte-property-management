import { SENDGRID_API_KEY } from '$env/static/private';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { adminAuth } from './admin';
import sgMail from '@sendgrid/mail';

const sendCustomPasswordResetEmail = (email: string, link: string) => {
	return new Promise<sgMail.ClientResponse>((resolve, reject) => {
		sgMail.setApiKey(SENDGRID_API_KEY);
		const msg = {
			to: email, // Change to your recipient
			from: 'support@lehmanfamilyrealty.com', // Change to your verified sender
			templateId: 'd-c4948d34428d4502a078fcfa04c6dfa4',
			dynamicTemplateData: {
				link
			}
		};
		sgMail
			.send(msg)
			.then((response) => {
				resolve(response[0]);
			})
			.catch((error) => {
				reject(error);
			});
	});
};

const sendCustomWelcomeEmail = (email: string, link: string) => {
	return new Promise<sgMail.ClientResponse>((resolve, reject) => {
		sgMail.setApiKey(SENDGRID_API_KEY);
		const msg = {
			to: email, // Change to your recipient
			from: 'support@lehmanfamilyrealty.com', // Change to your verified sender
			templateId: 'd-359091f71607470a8d16adfc7c4bb4db',
			dynamicTemplateData: {
				link
			}
		};
		sgMail
			.send(msg)
			.then((response) => {
				resolve(response[0]);
			})
			.catch((error) => {
				reject(error);
			});
	});
};

export const sendPasswordResetEmail = (email: string, isWelcomeEmail: boolean) => {
	return new Promise<sgMail.ClientResponse>((resolve, reject) => {
		const actionCodeSettings = {
			// URL you want to redirect back to. The domain (www.example.com) for
			// this URL must be whitelisted in the Firebase Console.
			url: `${PUBLIC_FRONTEND_URL}/`
		};

		adminAuth
			.generatePasswordResetLink(email, actionCodeSettings)
			.then((link) => {
				if (isWelcomeEmail) {
					resolve(sendCustomWelcomeEmail(email, link));
				} else {
					resolve(sendCustomPasswordResetEmail(email, link));
				}
			})
			.catch((error) => {
				console.error('Problem generating password reset link', error);
				reject(error);
			});
	});
};
