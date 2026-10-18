/**
 * Transaction fees, in integer cents. Shared by the server (which charges them) and the payment
 * dialog (which shows them), so the two always agree.
 */

export type OneTimeMethod = 'card' | 'bank';

/** The card fee: a flat 3%, rounded to the cent, the same for one-time Checkout payments and autopay. */
export const cardFeeCents = (amountCents: number) => Math.round(amountCents * 0.03);

/** The flat fee for a one-time bank (ACH) payment. */
export const BANK_FEE_CENTS = 500;

/** The fee for a one-time payment of `amountCents` by `method`. */
export const oneTimeFeeCents = (method: OneTimeMethod, amountCents: number) =>
	method === 'card' ? cardFeeCents(amountCents) : BANK_FEE_CENTS;

export const isOneTimeMethod = (value: unknown): value is OneTimeMethod =>
	value === 'card' || value === 'bank';
