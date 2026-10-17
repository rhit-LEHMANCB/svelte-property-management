import { stripe } from '$lib/server/stripe';
import type Stripe from 'stripe';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDB } from '$lib/server/admin';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { getUserDataOrError } from '$lib/server/authHelpers';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { loadLeaseLedger } from '$lib/server/balance';
import { allocate, allocationParts } from '$lib/server/billing';
import { inFlightCents } from '$lib/server/autopay';
import { loadCharges } from '$lib/server/autopayStore';
import { bankInFlightCents, bankPaymentsRef, loadBankPayments } from '$lib/server/bankPayments';
import { isOneTimeMethod, oneTimeFeeCents } from '$lib/fees';
import type { LeaseDoc } from '$lib/server/leaseDates';
import { propertyAddress } from '$lib/server/leases';
import { randomUUID } from 'node:crypto';

export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = getUserIdOrError(locals.userID);

	const userData = await getUserDataOrError(userId);

	const { amount, leaseId, method } = await request.json();

	if (!isOneTimeMethod(method)) {
		throw error(400, 'Choose card or bank account as the payment method');
	}

	if (!amount || typeof amount != 'number') {
		throw error(400, 'Amount must be a provided number for the amount to charge');
	}

	// Whole cents only: more than two decimals would be silently rounded into a different charge.
	const amountCents = Math.round(amount * 100);
	if (amountCents <= 0 || Math.abs(amount * 100 - amountCents) > 1e-6) {
		throw error(400, 'Amount must be greater than 0 and have at most two decimal places');
	}

	// The lease to pay against must be one the tenant is on. A missing, unknown or someone else's
	// lease gets the same answer, so lease ids cannot be probed.
	const lease =
		typeof leaseId === 'string' && leaseId !== ''
			? ((await adminDB.collection('leases').doc(leaseId).get()).data() as LeaseDoc | undefined)
			: undefined;
	if (!lease || !lease.tenantIds.includes(userId)) {
		throw error(403, 'You can only pay for a lease you are on.');
	}

	// What can be paid now: the balance minus money already on its way (bank payments that have not
	// settled, autopay charges in flight), so nobody pays the same rent twice.
	const leaseRef = adminDB.collection('leases').doc(leaseId);
	const [ledger, charges, bankPayments] = await Promise.all([
		loadLeaseLedger(leaseId, lease),
		loadCharges(leaseRef),
		loadBankPayments(leaseRef)
	]);
	const payableCents = Math.max(
		0,
		ledger.totalCents - inFlightCents(charges) - bankInFlightCents(bankPayments)
	);
	if (amountCents > payableCents) {
		throw error(400, 'Amount is greater than the balance owed');
	}

	const propertyData = (await adminDB.collection('properties').doc(lease.propertyId).get()).data();
	const where = propertyData
		? `${propertyAddress(propertyData)}, ${propertyData.state}`
		: 'your lease';

	// The same split the webhook applies: late fees, then the deposit, then rent. The webhook
	// recomputes it when the payment is recorded, so the lines describe the intent at checkout.
	const parts = allocationParts(allocate(ledger, lease, amountCents));
	const feeCents = oneTimeFeeCents(method, amountCents);
	const bank = method === 'bank';
	// A bank payment takes days to settle; its record ties every Stripe object back to it.
	const bankPaymentId = bank ? randomUUID().replaceAll('-', '') : undefined;

	const line = (name: string, description: string, unit_amount: number) => ({
		price_data: { currency: 'usd', product_data: { name, description }, unit_amount },
		quantity: 1
	});
	const lineItems = [
		...(parts.lateFeeCents > 0
			? [line('Late Fee', `Late fee for ${where}`, parts.lateFeeCents)]
			: []),
		...(parts.depositCents > 0
			? [line('Security Deposit', `Security deposit for ${where}`, parts.depositCents)]
			: []),
		...(parts.rentCents > 0 ? [line('Rent', `Rent payment for ${where}`, parts.rentCents)] : []),
		line(
			'Transaction Fee',
			`Transaction fee for one-time ${bank ? 'bank' : 'card'} payment.`,
			feeCents
		)
	];

	const metadata = {
		leaseID: leaseId,
		paymentMethod: method,
		...(bankPaymentId && { bankPaymentId })
	};
	if (bankPaymentId) {
		await bankPaymentsRef(leaseRef).doc(bankPaymentId).set({
			uid: userId,
			amountCents,
			feeCents,
			state: 'started',
			createdAt: new Date().toISOString(),
			startedDay: null
		});
	}

	// `payment_method_types` is still part of the pinned API version (2023-10-16), though the current
	// SDK's types no longer list it.
	const params: Stripe.Checkout.SessionCreateParams & {
		payment_method_types: ('card' | 'us_bank_account')[];
	} = {
		customer: userData.stripeID,
		billing_address_collection: 'auto',
		// Only the chosen method, so the fee always matches how the tenant pays. Cards include Apple Pay
		// and Google Pay; bank accounts can be verified by instant login or microdeposits.
		payment_method_types: bank ? ['us_bank_account'] : ['card'],
		payment_intent_data: {
			setup_future_usage: 'on_session',
			metadata
		},
		metadata,
		line_items: lineItems,
		mode: 'payment',
		invoice_creation: {
			enabled: true,
			invoice_data: {
				metadata: {
					// The webhook records the payment against this lease: late fees, then the deposit, then
					// the oldest unpaid rent. `rentCents` is kept for invoices read by older code.
					leaseID: leaseId,
					propertyID: lease.propertyId,
					rentCents: String(parts.rentCents),
					depositCents: String(parts.depositCents),
					lateFeeCents: String(parts.lateFeeCents),
					feeCents: String(feeCents),
					paymentMethod: method,
					...(bankPaymentId && { bankPaymentId })
				}
			}
		},
		success_url: bank
			? `${PUBLIC_FRONTEND_URL}/payment/success?bank={CHECKOUT_SESSION_ID}`
			: `${PUBLIC_FRONTEND_URL}/payment/success`,
		cancel_url: `${PUBLIC_FRONTEND_URL}/payment`
	};
	const session = await stripe.checkout.sessions.create(params).catch(async (err) => {
		// No session, so no payment: the record would only be clutter.
		if (bankPaymentId) {
			await bankPaymentsRef(leaseRef)
				.doc(bankPaymentId)
				.delete()
				.catch(() => undefined);
		}
		throw err;
	});

	if (session.url) {
		return json({ url: session.url });
	} else {
		throw error(500, 'Failed to create checkout session');
	}
};
