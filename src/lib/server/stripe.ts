import { STRIPE_API_KEY } from '$env/static/private';
import Stripe from 'stripe';

// STRIPE_API_BASE_URL is set only by the end-to-end tests, which point the client at a local fake
// instead of api.stripe.com. It is read at runtime, so it is not a required variable.
const baseUrl = process.env.STRIPE_API_BASE_URL;
const target = baseUrl ? new URL(baseUrl) : undefined;

export const stripe = new Stripe(
	STRIPE_API_KEY,
	target
		? {
				host: target.hostname,
				port: target.port,
				protocol: target.protocol.replace(':', '') as 'http' | 'https'
		  }
		: undefined
);
