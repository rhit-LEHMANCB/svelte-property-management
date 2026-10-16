import type { Ledger } from './billing';

/**
 * Autopay: the pure parts. A tenant saves a card or bank account and enrolls it for a lease; the
 * daily job charges enrolled tenants in enrollment order when money on the lease is due. Everything
 * here is in integer cents and free of Firestore and Stripe, so it can be tested on its own.
 */

export type PaymentMethodType = 'card' | 'us_bank_account';

/** `leases/{leaseId}/autopay/{uid}`. Server-only: the payment method id never leaves the server. */
export type Enrollment = {
	uid: string;
	paymentMethodId: string;
	type: PaymentMethodType;
	/** The card brand (`visa`) or the bank's name. */
	brand: string;
	last4: string;
	/** The most this tenant is charged for one due date; null for whatever is owed. */
	amountCents: number | null;
	/** ISO time of the first enrollment; charges go in this order. */
	enrolledAt: string;
	/** The Checkout session that saved the current method, so completing it twice changes nothing. */
	setupSessionId?: string;
	/** When the current payment method was saved (a setup session started earlier cannot replace it). */
	methodUpdatedAt?: string;
	updatedAt?: string;
};

/** What a tenant (or an admin) is shown about an enrollment. */
export type PublicEnrollment = {
	type: PaymentMethodType;
	brand: string;
	last4: string;
	/** `Visa ending 4242` or `Bank account ending 6789` */
	method: string;
	amountCents: number | null;
	enrolledAt: string;
};

export type ChargeState = 'claimed' | 'pending' | 'succeeded' | 'failed' | 'gave-up';

/** A failed attempt, kept so its email can be sent (and retried) after later attempts. */
export type ChargeFailure = { attempt: number; day: string; error: string; amountCents: number };

/** `leases/{leaseId}/autopay_charges/{cycleKey}_{uid}`: one tenant's charge for one due date. */
export type ChargeRecord = {
	uid: string;
	cycleKey: string;
	state: ChargeState;
	/** Attempts made so far, counting days, not tenants; the current attempt while claimed. */
	attempts: number;
	/** The business day of the latest attempt. */
	lastAttemptDay: string;
	claimedAt: string;
	/** Which run holds the claim. */
	claimToken?: string;
	/** Bumped when a crashed attempt's invoice is settled and a new one must be made. */
	resume?: number;
	amountCents: number;
	feeCents: number;
	invoiceId?: string | null;
	error?: string | null;
	failures?: ChargeFailure[];
	gaveUpDay?: string | null;
	/** Set by the webhook when the payment is recorded on the lease. */
	recordedAt?: string | null;
};

/** Attempts per due date: the first on (or after) the due date and 3 daily retries. */
export const MAX_ATTEMPTS = 4;

/** Stripe does not charge less than this. */
export const MIN_CHARGE_CENTS = 50;

/** The transaction fee for a payment of `amountCents`: card 2.9% + $0.30; a bank account is free. */
export function autopayFeeCents(type: PaymentMethodType, amountCents: number) {
	return type === 'card' ? cardFeeCents(amountCents) : 0;
}

/** The card fee, the same for one-time Checkout payments and autopay. */
export const cardFeeCents = (amountCents: number) => Math.round(amountCents * 0.029 + 30);

const BRANDS: Record<string, string> = {
	visa: 'Visa',
	mastercard: 'Mastercard',
	amex: 'American Express',
	discover: 'Discover',
	diners: 'Diners Club',
	jcb: 'JCB',
	unionpay: 'UnionPay'
};

/** `Visa ending 4242`, `Bank account ending 6789`. */
export function methodLabel(enrollment: Pick<Enrollment, 'type' | 'brand' | 'last4'>) {
	if (enrollment.type === 'us_bank_account') return `Bank account ending ${enrollment.last4}`;
	const brand =
		BRANDS[enrollment.brand] ??
		(enrollment.brand ? enrollment.brand[0].toUpperCase() + enrollment.brand.slice(1) : 'Card');
	return `${brand} ending ${enrollment.last4}`;
}

/** The client-facing shape of an enrollment, without the payment method id. */
export function publicEnrollment(enrollment: Enrollment): PublicEnrollment {
	return {
		type: enrollment.type,
		brand: enrollment.brand,
		last4: enrollment.last4,
		method: methodLabel(enrollment),
		amountCents: enrollment.amountCents,
		enrolledAt: enrollment.enrolledAt
	};
}

/** Charge order: first enrolled first, ties by uid. */
export const byEnrollmentOrder = (a: Enrollment, b: Enrollment) =>
	a.enrolledAt.localeCompare(b.enrolledAt) || a.uid.localeCompare(b.uid);

export const chargeId = (cycleKey: string, uid: string) => `${cycleKey}_${uid}`;

/**
 * What is due on a lease by `today`: late fees, the deposit and rent whose due dates have come.
 * Rent payable early (counted 7 days before its due date) is not due yet.
 */
export function dueNow(ledger: Ledger): { cycleKey: string | null; dueCents: number } {
	const today = ledger.today;
	const items = [
		...ledger.lateFees.map((f) => ({ dueDate: f.dueDate, owedCents: f.owedCents })),
		...(ledger.deposit.owedCents > 0
			? [{ dueDate: ledger.deposit.dueDate ?? today, owedCents: ledger.deposit.owedCents }]
			: []),
		...ledger.rent.map((r) => ({ dueDate: r.dueDate, owedCents: r.owedCents }))
	].filter((item) => item.owedCents > 0 && item.dueDate <= today);
	const dueCents = Math.min(
		ledger.totalCents,
		items.reduce((sum, item) => sum + item.owedCents, 0)
	);
	if (dueCents <= 0) return { cycleKey: null, dueCents: 0 };
	// The latest due date reached: a new due date starts a new cycle of attempts, so a cycle that
	// gave up does not stop autopay for later due dates.
	const cycleKey = items.map((item) => item.dueDate).sort()[items.length - 1];
	return { cycleKey, dueCents };
}

/** Money already on its way: a pending charge, or a paid one the webhook has not recorded yet. */
export const inFlightCents = (charges: ChargeRecord[]) =>
	charges
		.filter((c) => c.state === 'pending' || (c.state === 'succeeded' && !c.recordedAt))
		.reduce((sum, c) => sum + c.amountCents, 0);

export type PlannedCharge = {
	uid: string;
	/** 1 for the first try for this due date, up to MAX_ATTEMPTS. */
	attempt: number;
	amountCents: number;
};

export type AutopayPlan = { cycleKey: string | null; charges: PlannedCharge[] };

/**
 * The charges to make on a lease today, in order, each for the smaller of the tenant's amount and
 * what is still owed after the charges before it (assuming they succeed). The daily job makes the
 * first, then plans again with the outcome, so a declined charge moves its amount to the next
 * tenant.
 *
 * `charges` are all of the lease's charge records: pending ones from any due date are subtracted
 * from what is owed, and this due date's records decide who can still be charged today.
 */
export function planAutopay(input: {
	ledger: Ledger;
	enrollments: Enrollment[];
	charges: ChargeRecord[];
	today: string;
	/** Lease tenants; enrollments of anyone no longer on the lease are ignored. */
	tenantIds: string[];
	/** Treated as live claims, not crashed ones. */
	isStaleClaim?: (charge: ChargeRecord) => boolean;
}): AutopayPlan {
	const { ledger, charges, today } = input;
	const { cycleKey, dueCents } = dueNow(ledger);
	if (!cycleKey) return { cycleKey: null, charges: [] };

	// A live claim belongs to another run that may be charging right now: count it as in flight.
	const live = (c: ChargeRecord) => c.state === 'claimed' && !input.isStaleClaim?.(c);
	let remaining =
		dueCents - inFlightCents(charges) - charges.filter(live).reduce((s, c) => s + c.amountCents, 0);

	const planned: PlannedCharge[] = [];
	const enrollments = input.enrollments
		.filter((e) => input.tenantIds.includes(e.uid))
		.sort(byEnrollmentOrder);
	for (const enrollment of enrollments) {
		if (remaining < MIN_CHARGE_CENTS) break;
		const record = charges.find((c) => c.cycleKey === cycleKey && c.uid === enrollment.uid);
		let attempt = 1;
		if (record) {
			if (record.state === 'succeeded' || record.state === 'pending' || record.state === 'gave-up')
				continue;
			if (live(record)) continue;
			if (record.state === 'claimed') {
				// A crashed attempt: continue it under the same attempt number.
				attempt = record.attempts;
			} else {
				if (record.lastAttemptDay >= today || record.attempts >= MAX_ATTEMPTS) continue;
				attempt = record.attempts + 1;
			}
		}
		const amountCents = Math.min(enrollment.amountCents ?? remaining, remaining);
		if (amountCents < MIN_CHARGE_CENTS) continue;
		planned.push({ uid: enrollment.uid, attempt, amountCents });
		remaining -= amountCents;
	}
	return { cycleKey, charges: planned };
}

/**
 * How a balance would be split among enrolled tenants on a due date, in enrollment order: what the
 * 7-day autopay notice tells each of them.
 */
export function projectedSplit(totalCents: number, enrollments: Enrollment[]) {
	let remaining = totalCents;
	const split = new Map<string, number>();
	for (const enrollment of [...enrollments].sort(byEnrollmentOrder)) {
		const cents = Math.max(0, Math.min(enrollment.amountCents ?? remaining, remaining));
		split.set(enrollment.uid, cents >= MIN_CHARGE_CENTS ? cents : 0);
		remaining -= split.get(enrollment.uid)!;
	}
	return split;
}

/** The largest autopay amount a tenant can set: $999,999.99. */
export const MAX_AMOUNT_CENTS = 99_999_999;

/** Whole cents from a dollar amount with at most two decimals, or undefined when it is not one. */
export function parseAmountCents(amount: unknown): number | undefined {
	if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined;
	const cents = Math.round(amount * 100);
	if (cents <= 0 || cents > MAX_AMOUNT_CENTS || Math.abs(amount * 100 - cents) > 1e-6) {
		return undefined;
	}
	return cents;
}
