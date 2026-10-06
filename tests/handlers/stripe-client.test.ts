import { afterEach, describe, expect, it, vi } from 'vitest';

// The real Stripe client module, with the `stripe` package replaced so its constructor arguments can be read.
vi.unmock('#lib/server/stripe');
const constructed = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('stripe', () => ({
	default: class {
		constructor(...args: unknown[]) {
			constructed.calls.push(args);
		}
	}
}));

const loadClient = async (baseUrl?: string) => {
	vi.resetModules();
	constructed.calls.length = 0;
	if (baseUrl === undefined) delete process.env.STRIPE_API_BASE_URL;
	else process.env.STRIPE_API_BASE_URL = baseUrl;
	await import('#lib/server/stripe');
	return constructed.calls[0];
};

afterEach(() => {
	delete process.env.STRIPE_API_BASE_URL;
});

describe('rent-payments: Stripe client configuration', () => {
	it('Scenario: without an override the client talks to Stripe with only the API key', async () => {
		const [key, options] = (await loadClient()) as [string, unknown];

		expect(key).toBe('sk_test_fixture');
		expect(options).toBeUndefined();
	});

	it('Scenario: a loopback override (used only by the end-to-end tests) points the client at the local fake', async () => {
		const [, options] = (await loadClient('http://127.0.0.1:12111')) as [string, object];

		expect(options).toEqual({ host: '127.0.0.1', port: '12111', protocol: 'http' });
	});

	it('Scenario: localhost is accepted as a loopback host too', async () => {
		const [, options] = (await loadClient('http://localhost:9999')) as [string, object];

		expect(options).toEqual({ host: 'localhost', port: '9999', protocol: 'http' });
	});

	it('Scenario: a malformed override is ignored with a warning instead of breaking every import', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const [key, options] = (await loadClient('not a url')) as [string, unknown];

		expect(key).toBe('sk_test_fixture');
		expect(options).toBeUndefined();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a valid URL'));
	});

	it('Scenario: an override that is not a loopback address is ignored, so the secret key cannot be sent elsewhere', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const [, options] = (await loadClient('https://evil.example.com')) as [string, unknown];

		expect(options).toBeUndefined();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a loopback'));
	});
});
