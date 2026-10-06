import { describe, expect, it, vi } from 'vitest';
import { checkStripeKeyMode } from '../../src/lib/server/stripeKeyGuard';

describe('checkStripeKeyMode', () => {
	it('refuses a live key on the dev project without printing the key', () => {
		const key = 'sk_live_supersecretvalue';
		let message = '';
		try {
			checkStripeKeyMode(key, 'lehman-realty-dev', vi.fn());
		} catch (e) {
			message = (e as Error).message;
		}
		expect(message).toMatch(/live-mode Stripe key/);
		expect(message).not.toContain('supersecretvalue');
	});

	it('refuses restricted live keys and emulator projects too', () => {
		expect(() => checkStripeKeyMode('rk_live_x', 'lehman-realty-dev', vi.fn())).toThrow();
		expect(() => checkStripeKeyMode('sk_live_x', 'demo-lehman-realty', vi.fn())).toThrow();
	});

	it('warns, without throwing or printing the key, for a test key in production', () => {
		const warn = vi.fn();

		expect(() => checkStripeKeyMode('sk_test_secret123', 'lehman-realty', warn)).not.toThrow();

		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).not.toContain('secret123');
	});

	it('is quiet for a test key in dev and a live key in production', () => {
		const warn = vi.fn();

		checkStripeKeyMode('sk_test_x', 'lehman-realty-dev', warn);
		checkStripeKeyMode('rk_test_x', 'demo-lehman-realty', warn);
		checkStripeKeyMode('sk_live_x', 'lehman-realty', warn);

		expect(warn).not.toHaveBeenCalled();
	});
});
