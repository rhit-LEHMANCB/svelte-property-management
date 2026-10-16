// A tiny stand-in for api.stripe.com, started by Playwright. The app's Stripe client is pointed
// here through STRIPE_API_BASE_URL, so payment flows run without any network or credentials.
//
//   POST   /v1/checkout/sessions  records the form body, answers with a local checkout URL
//   GET    /pay/<id>              the page the browser lands on
//   GET    /__requests            what the app has sent so far (used by the specs)
//   DELETE /__requests            forget recorded requests
//   POST   /v1/customers          answers with a new customer id
//   POST   /v1/customers/<id>     records the update, answers with the customer
//   DELETE /v1/customers/<id>     answers that the customer is deleted
//
// It also stands in for the Resend API (the app's RESEND_BASE_URL points here in e2e mode):
//
//   POST   /emails                records the email, answers with an id
//   GET    /__emails              the emails sent so far
//   DELETE /__emails              forget sent emails
//   POST   /__emails/fail-next    make the next email fail, as an outage would
//
// Autopay: setup-mode Checkout and off-session invoices.
//
//   POST   /v1/checkout/sessions (mode=setup)  answers with a local setup page URL
//   GET    /setup/<id>            the setup page; its "Save" link returns to the success URL
//   GET    /v1/checkout/sessions/<id>  the completed session with a saved method
//   POST   /__setup/method        {type: 'card' | 'us_bank_account'}: what the next setups save
//   POST   /v1/invoices, /v1/invoiceitems, /v1/invoices/<id>/finalize|pay|void, GET/DELETE /v1/invoices/<id>
//   POST   /__pay/mode            {mode: 'succeed' | 'processing' | 'decline'}: how invoices pay
//   GET    /__invoices            the invoices made so far, with their items
import http from 'node:http';

const port = Number(process.env.FAKE_STRIPE_PORT ?? 12111);
const requests = [];
const emails = [];
let customers = 0;
let failNextEmail = false;
const sessions = new Map();
const invoices = new Map();
let setupMethod = 'card';
let payMode = 'succeed';
let invoiceCount = 0;

/** A Stripe form body (`metadata[leaseID]=...`) as a nested object, one level deep. */
const parseForm = (raw) => {
	const result = {};
	for (const [key, value] of new URLSearchParams(raw)) {
		const match = /^([^[]+)\[([^\]]+)\]$/.exec(key);
		if (match) result[match[1]] = { ...(result[match[1]] ?? {}), [match[2]]: value };
		else result[key] = value;
	}
	return result;
};

const savedMethod = (type) =>
	type === 'us_bank_account'
		? {
				id: 'pm_fake_bank',
				object: 'payment_method',
				type,
				us_bank_account: { bank_name: 'STRIPE TEST BANK', last4: '6789' }
			}
		: {
				id: 'pm_fake_card',
				object: 'payment_method',
				type: 'card',
				card: { brand: 'visa', last4: '4242' }
			};

const send = (res, status, body, type = 'application/json') => {
	res.writeHead(status, { 'content-type': type });
	res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

const server = http.createServer(async (req, res) => {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	const raw = Buffer.concat(chunks).toString();
	const { pathname } = new URL(req.url, `http://127.0.0.1:${port}`);

	if (req.method === 'GET' && pathname === '/__requests') return send(res, 200, requests);
	if (req.method === 'DELETE' && pathname === '/__requests') {
		requests.length = 0;
		return send(res, 200, {});
	}
	if (
		req.method === 'POST' &&
		pathname === '/v1/checkout/sessions' &&
		parseForm(raw).mode === 'setup'
	) {
		const body = parseForm(raw);
		requests.push({ path: pathname, body: Object.fromEntries(new URLSearchParams(raw)) });
		const id = `cs_fake_setup_${sessions.size + 1}`;
		sessions.set(id, { body, method: setupMethod, created: Math.floor(Date.now() / 1000) });
		return send(res, 200, {
			id,
			object: 'checkout.session',
			url: `http://127.0.0.1:${port}/setup/${id}`
		});
	}
	if (req.method === 'GET' && pathname.startsWith('/setup/')) {
		const id = pathname.split('/').pop();
		const session = sessions.get(id);
		if (!session) return send(res, 404, 'No such session', 'text/html');
		const back = session.body.success_url.replace('{CHECKOUT_SESSION_ID}', id);
		return send(
			res,
			200,
			`<h1 id="fake-setup">Fake Stripe setup</h1><a id="fake-setup-save" href="${back}">Save</a>`,
			'text/html'
		);
	}
	if (req.method === 'GET' && pathname.startsWith('/v1/checkout/sessions/')) {
		const id = pathname.split('/').pop();
		const session = sessions.get(id);
		if (!session)
			return send(res, 404, {
				error: { type: 'invalid_request_error', message: 'No such session' }
			});
		return send(res, 200, {
			id,
			object: 'checkout.session',
			mode: 'setup',
			status: 'complete',
			created: session.created,
			customer: session.body.customer,
			metadata: session.body.metadata ?? {},
			setup_intent: {
				id: `seti_${id}`,
				status: 'succeeded',
				payment_method: savedMethod(session.method)
			}
		});
	}
	if (req.method === 'POST' && pathname === '/__setup/method') {
		setupMethod = JSON.parse(raw || '{}').type ?? 'card';
		return send(res, 200, {});
	}
	if (req.method === 'POST' && pathname === '/__pay/mode') {
		payMode = JSON.parse(raw || '{}').mode ?? 'succeed';
		return send(res, 200, {});
	}
	if (req.method === 'GET' && pathname === '/__invoices')
		return send(res, 200, [...invoices.values()]);
	if (req.method === 'POST' && pathname === '/v1/invoices') {
		// Idempotency: the same key returns the same invoice, as Stripe does.
		const key = req.headers['idempotency-key'];
		const existing = [...invoices.values()].find((i) => key && i.key === key);
		if (existing) return send(res, 200, existing);
		invoiceCount += 1;
		const body = parseForm(raw);
		const invoice = {
			id: `in_fake_${invoiceCount}`,
			object: 'invoice',
			key,
			status: 'draft',
			customer: body.customer,
			created: Math.floor(Date.now() / 1000),
			metadata: body.metadata ?? {},
			items: []
		};
		invoices.set(invoice.id, invoice);
		return send(res, 200, invoice);
	}
	if (req.method === 'POST' && pathname === '/v1/invoiceitems') {
		const body = parseForm(raw);
		const invoice = invoices.get(body.invoice);
		if (invoice && !invoice.items.some((i) => i.key === req.headers['idempotency-key'])) {
			invoice.items.push({
				key: req.headers['idempotency-key'],
				description: body.description,
				amount: Number(body.amount)
			});
		}
		return send(res, 200, { id: `ii_${invoiceCount}`, object: 'invoiceitem' });
	}
	const invoiceAction = /^\/v1\/invoices\/([^/]+)(?:\/(finalize|pay|void))?$/.exec(pathname);
	if (invoiceAction) {
		const invoice = invoices.get(invoiceAction[1]);
		if (!invoice)
			return send(res, 404, {
				error: { type: 'invalid_request_error', message: 'No such invoice' }
			});
		const action = invoiceAction[2];
		if (req.method === 'GET' && !action) return send(res, 200, invoice);
		if (req.method === 'DELETE' && !action) {
			invoices.delete(invoice.id);
			return send(res, 200, { id: invoice.id, deleted: true });
		}
		if (action === 'finalize') invoice.status = 'open';
		if (action === 'void') invoice.status = 'void';
		if (action === 'pay') {
			if (payMode === 'decline') {
				return send(res, 402, {
					error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' }
				});
			}
			if (payMode === 'processing') {
				return send(res, 200, {
					...invoice,
					payment_intent: { id: `pi_${invoice.id}`, object: 'payment_intent', status: 'processing' }
				});
			}
			invoice.status = 'paid';
		}
		return send(res, 200, invoice);
	}
	if (req.method === 'POST' && pathname === '/v1/checkout/sessions') {
		requests.push({ path: pathname, body: Object.fromEntries(new URLSearchParams(raw)) });
		return send(res, 200, {
			id: 'cs_fake_1',
			object: 'checkout.session',
			url: `http://127.0.0.1:${port}/pay/cs_fake_1`
		});
	}
	if (req.method === 'POST' && pathname === '/v1/customers') {
		customers += 1;
		return send(res, 200, { id: `cus_fake_${customers}`, object: 'customer' });
	}
	if (req.method === 'POST' && pathname.startsWith('/v1/customers/')) {
		requests.push({ path: pathname, body: Object.fromEntries(new URLSearchParams(raw)) });
		return send(res, 200, { id: pathname.split('/').pop(), object: 'customer' });
	}
	if (req.method === 'DELETE' && pathname.startsWith('/v1/customers/')) {
		return send(res, 200, { id: pathname.split('/').pop(), object: 'customer', deleted: true });
	}
	if (req.method === 'POST' && pathname === '/emails') {
		if (failNextEmail) {
			failNextEmail = false;
			return send(res, 500, { name: 'internal_server_error', message: 'fake outage' });
		}
		const email = JSON.parse(raw);
		emails.push({ to: email.to, subject: email.subject, text: email.text });
		return send(res, 200, { id: `email_${emails.length}` });
	}
	if (req.method === 'GET' && pathname === '/__emails') return send(res, 200, emails);
	if (req.method === 'DELETE' && pathname === '/__emails') {
		emails.length = 0;
		return send(res, 200, {});
	}
	if (req.method === 'POST' && pathname === '/__emails/fail-next') {
		failNextEmail = true;
		return send(res, 200, {});
	}
	if (req.method === 'GET' && pathname.startsWith('/pay/')) {
		return send(res, 200, '<h1 id="fake-checkout">Fake Stripe Checkout</h1>', 'text/html');
	}
	send(res, 404, { error: { message: `fake stripe: unhandled ${req.method} ${pathname}` } });
});

server.listen(port, '127.0.0.1', () => console.log(`fake stripe listening on ${port}`));
