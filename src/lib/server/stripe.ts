import { STRIPE_API_KEY } from '$env/static/private';
import { PUBLIC_FB_PROJECT_ID } from '$env/static/public';
import Stripe from 'stripe';
import { checkStripeKeyMode } from './stripeKeyGuard';

checkStripeKeyMode(STRIPE_API_KEY, PUBLIC_FB_PROJECT_ID);

// STRIPE_API_BASE_URL is set only by the end-to-end tests, which point the client at a local fake
// instead of api.stripe.com. It is read at runtime, so it is not a required variable, and it is
// honored only for a loopback host so that it can never send the secret key to another server.
const loopbackHosts = ['127.0.0.1', 'localhost'];
const baseUrl = process.env.STRIPE_API_BASE_URL;
let target: URL | undefined;
if (baseUrl) {
	try {
		const candidate = new URL(baseUrl);
		if (loopbackHosts.includes(candidate.hostname)) {
			target = candidate;
		} else {
			console.warn('Ignoring STRIPE_API_BASE_URL: it is not a loopback address.');
		}
	} catch {
		console.warn('Ignoring STRIPE_API_BASE_URL: it is not a valid URL.');
	}
}

// Stripe SDKs send the API version they were built for. stripe 14, which this app ran on before,
// used 2023-10-16; the current SDK defaults to a version three years newer. Pinning the old one
// keeps every request (customers, checkout sessions, portal sessions) behaving exactly as before.
// Moving to a newer API version is a separate change that needs a Stripe test-mode pass.
const API_VERSION = '2023-10-16' as unknown as Stripe.LatestApiVersion;

export const stripe = new Stripe(STRIPE_API_KEY, {
	apiVersion: API_VERSION,
	...(target && {
		host: target.hostname,
		port: target.port || undefined,
		protocol: target.protocol.replace(':', '') as 'http' | 'https'
	})
});
