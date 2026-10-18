import { describe, expect, it } from 'vitest';
import { BANK_FEE_CENTS, cardFeeCents, isOneTimeMethod, oneTimeFeeCents } from '../../src/lib/fees';

describe('one-time payment fees', () => {
	it('card: a flat 3%, rounded to the cent', () => {
		expect(cardFeeCents(96452)).toBe(2894);
		expect(oneTimeFeeCents('card', 96452)).toBe(2894);
		expect(oneTimeFeeCents('card', 60000)).toBe(1800);
		// Small payments get no fixed part.
		expect(cardFeeCents(1000)).toBe(30);
	});

	it('bank: a flat $5.00 whatever the amount', () => {
		expect(BANK_FEE_CENTS).toBe(500);
		for (const amount of [50, 96452, 1_000_000]) {
			expect(oneTimeFeeCents('bank', amount)).toBe(500);
		}
	});

	it('only card and bank are methods', () => {
		expect(isOneTimeMethod('card')).toBe(true);
		expect(isOneTimeMethod('bank')).toBe(true);
		for (const value of ['us_bank_account', 'cashapp', '', undefined, null, 1]) {
			expect(isOneTimeMethod(value)).toBe(false);
		}
	});
});
