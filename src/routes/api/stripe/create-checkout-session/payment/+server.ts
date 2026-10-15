import { stripe } from '$lib/server/stripe';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDB } from '$lib/server/admin';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { getUserDataOrError } from '$lib/server/authHelpers';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { loadLeaseLedger } from '$lib/server/balance';
import { allocate, allocationParts } from '$lib/server/billing';
import type { LeaseDoc } from '$lib/server/leaseDates';
import { propertyAddress } from '$lib/server/leases';

export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = getUserIdOrError(locals.userID);

	const userData = await getUserDataOrError(userId);

	const { amount, leaseId } = await request.json();

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

	const ledger = await loadLeaseLedger(leaseId, lease);
	if (amountCents > ledger.totalCents) {
		throw error(400, 'Amount is greater than the balance owed');
	}

	const propertyData = (await adminDB.collection('properties').doc(lease.propertyId).get()).data();
	const where = propertyData
		? `${propertyAddress(propertyData)}, ${propertyData.state}`
		: 'your lease';

	// The same split the webhook applies: late fees, then the deposit, then rent. The webhook
	// recomputes it when the payment is recorded, so the lines describe the intent at checkout.
	const parts = allocationParts(allocate(ledger, lease, amountCents));
	const feeCents = Math.round(amountCents * 0.029 + 30);

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
			'Transaction fee for one-time payment. Set up auto-pay to waive this fee.',
			feeCents
		)
	];

	const session = await stripe.checkout.sessions.create({
		customer: userData.stripeID,
		billing_address_collection: 'auto',
		payment_intent_data: {
			setup_future_usage: 'on_session'
		},
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
					feeCents: String(feeCents)
				}
			}
		},
		success_url: `${PUBLIC_FRONTEND_URL}/payment/success`,
		cancel_url: `${PUBLIC_FRONTEND_URL}/payment`
	});

	if (session.url) {
		return json({ url: session.url });
	} else {
		throw error(500, 'Failed to create checkout session');
	}
};
