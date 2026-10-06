import { defineEnvVars } from '@sveltejs/kit/env';

// Every variable is static: its value is read when the app is built and inlined, because the
// deployed Cloud Function is built in CI with these values and has no runtime environment of its own.
// Private variables are only importable from server code (`$app/env/private`).
const privateVar = { static: true } as const;
const publicVar = { public: true, static: true } as const;

export const variables = defineEnvVars({
	// Firebase web app config
	PUBLIC_FB_PROJECT_ID: publicVar,
	PUBLIC_FB_API_KEY: publicVar,
	PUBLIC_FB_AUTH_DOMAIN: publicVar,
	PUBLIC_FB_STORAGE_BUCKET: publicVar,
	PUBLIC_FB_MESSAGING_SENDER_ID: publicVar,
	PUBLIC_FB_APP_ID: publicVar,
	PUBLIC_FB_MEASUREMENT_ID: publicVar,
	// Base URL of this app, used in Stripe return URLs and in password reset and welcome emails
	PUBLIC_FRONTEND_URL: publicVar,
	// Firebase Admin service account
	FB_CLIENT_EMAIL: privateVar,
	FB_PRIVATE_KEY: privateVar,
	SENDGRID_API_KEY: privateVar,
	STRIPE_API_KEY: privateVar,
	STRIPE_ENDPOINT_SECRET: privateVar
});
