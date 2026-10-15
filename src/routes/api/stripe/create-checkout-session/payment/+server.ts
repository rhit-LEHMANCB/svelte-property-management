import { stripe } from '$lib/server/stripe';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDB } from '$lib/server/admin';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { getUserDataOrError } from '$lib/server/authHelpers';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { loadLeaseBalance } from '$lib/server/balance';
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

	const { balanceCents } = await loadLeaseBalance(leaseId, lease);
	if (amountCents > balanceCents) {
		throw error(400, 'Amount is greater than the balance owed');
	}

	const propertyData = (await adminDB.collection('properties').doc(lease.propertyId).get()).data();

	const feeCents = Math.round(amountCents * 0.029 + 30);

	const session = await stripe.checkout.sessions.create({
		customer: userData.stripeID,
		billing_address_collection: 'auto',
		payment_intent_data: {
			setup_future_usage: 'on_session'
		},
		line_items: [
			{
				price_data: {
					currency: 'usd',
					product_data: {
						name: 'Rent',
						description: `Rent payment for ${propertyData ? `${propertyAddress(propertyData)}, ${propertyData.state}` : 'your lease'}`
					},
					unit_amount: amountCents
				},
				// For metered billing, do not pass quantity
				quantity: 1
			},
			{
				price_data: {
					currency: 'usd',
					product_data: {
						name: 'Transaction Fee',
						description: `Transaction fee for one-time payment. Set up auto-pay to waive this fee.`
					},
					unit_amount: feeCents
				},
				// For metered billing, do not pass quantity
				quantity: 1
			}
		],
		mode: 'payment',
		invoice_creation: {
			enabled: true,
			invoice_data: {
				metadata: {
					// The webhook records the payment against this lease, oldest unpaid month first.
					leaseID: leaseId,
					propertyID: lease.propertyId,
					rentCents: String(amountCents),
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
