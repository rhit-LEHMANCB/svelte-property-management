import { STRIPE_API_KEY } from '$env/static/private';
import Stripe from 'stripe';

// STRIPE_API_BASE_URL is set only by the end-to-end tests, which point the client at a local fake
// instead of api.stripe.com. It is read at runtime, so it is not a required variable, and it is
// honored only for a loopback host so that it can never send the secret key to another server.
const loopbackHosts = ['127.0.0.1', 'localhost', '[::1]'];
const baseUrl = process.env.STRIPE_API_BASE_URL;
let target: URL | undefined;
if (baseUrl) {
	const candidate = new URL(baseUrl);
	if (loopbackHosts.includes(candidate.hostname)) {
		target = candidate;
	} else {
		console.warn('Ignoring STRIPE_API_BASE_URL: it is not a loopback address.');
	}
}

export const stripe = new Stripe(
	STRIPE_API_KEY,
	target
		? {
				host: target.hostname,
				port: target.port || undefined,
				protocol: target.protocol.replace(':', '') as 'http' | 'https'
		  }
		: undefined
);
