import { expect, test } from '@playwright/test';
import Stripe from 'stripe';
import { APP_URL, PROPERTY } from '../support/constants';
import { adminDb } from '../support/admin';

// Sends a signed invoice.payment_succeeded event to the running app, so the handler's Firestore
// transaction runs against the real emulator and not against the in-memory fake.
const WEBHOOK_SECRET = 'whsec_e2e';

async function deliver(event: object) {
	const payload = JSON.stringify(event);
	const signature = new Stripe('sk_test_unused').webhooks.generateTestHeaderString({
		payload,
		secret: WEBHOOK_SECRET
	});
	return fetch(`${APP_URL}/api/stripe/webhook`, {
		method: 'POST',
		headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
		body: payload
	});
}

test.describe('rent-payments: webhook on the Firestore emulator', () => {
	test('Scenario: a payment is recorded once, with the fee, and a redelivery changes nothing', async () => {
		const property = adminDb().collection('properties').doc(PROPERTY.id);
		const invoiceId = `in_e2e_${Date.now()}`;
		const created = Math.floor(Date.UTC(2031, 5, 15, 16) / 1000);
		const event = {
			id: `evt_${invoiceId}`,
			object: 'event',
			type: 'invoice.payment_succeeded',
			data: {
				object: {
					id: invoiceId,
					object: 'invoice',
					created,
					metadata: { propertyID: PROPERTY.id, rentCents: '40000', feeCents: '1190' },
					lines: { data: [] }
				}
			}
		};

		expect((await deliver(event)).status).toBe(200);
		expect((await deliver(event)).status).toBe(200);

		const year = (await property.collection('payment_history').doc('2031').get()).data();
		expect(year?.June.remainingBalance).toBe(PROPERTY.rent - 400);
		expect(year?.June.transactions).toHaveLength(1);
		expect(year?.June.transactions[0]).toMatchObject({ amount: 400, fee: 11.9 });
		expect((await property.collection('recorded_invoices').doc(invoiceId).get()).exists).toBe(true);
	});

	test('Scenario: a payment spanning two years is recorded in both year documents', async () => {
		const property = adminDb().collection('properties').doc(PROPERTY.id);
		const event = {
			id: 'evt_span',
			object: 'event',
			type: 'invoice.payment_succeeded',
			data: {
				object: {
					id: `in_span_${Date.now()}`,
					object: 'invoice',
					created: Math.floor(Date.UTC(2032, 0, 15, 16) / 1000),
					metadata: {
						propertyID: PROPERTY.id,
						rentCents: '150000',
						feeCents: '4000',
						moveInMonth: '2031-12'
					},
					lines: { data: [] }
				}
			}
		};

		expect((await deliver(event)).status).toBe(200);

		const earlier = (await property.collection('payment_history').doc('2031').get()).data();
		const later = (await property.collection('payment_history').doc('2032').get()).data();
		expect(earlier?.December.remainingBalance).toBe(0);
		expect(later?.January.remainingBalance).toBe(PROPERTY.rent - 500);
	});
});
