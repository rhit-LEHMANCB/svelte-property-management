// A tiny stand-in for api.stripe.com, started by Playwright. The app's Stripe client is pointed
// here through STRIPE_API_BASE_URL, so payment flows run without any network or credentials.
//
//   POST   /v1/checkout/sessions  records the form body, answers with a local checkout URL
//   GET    /pay/<id>              the page the browser lands on
//   GET    /__requests            what the app has sent so far (used by the specs)
//   DELETE /__requests            forget recorded requests
import http from 'node:http';

const port = Number(process.env.FAKE_STRIPE_PORT ?? 12111);
const requests = [];

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
	if (req.method === 'POST' && pathname === '/v1/checkout/sessions') {
		requests.push({ path: pathname, body: Object.fromEntries(new URLSearchParams(raw)) });
		return send(res, 200, {
			id: 'cs_fake_1',
			object: 'checkout.session',
			url: `http://127.0.0.1:${port}/pay/cs_fake_1`
		});
	}
	if (req.method === 'GET' && pathname.startsWith('/pay/')) {
		return send(res, 200, '<h1 id="fake-checkout">Fake Stripe Checkout</h1>', 'text/html');
	}
	send(res, 404, { error: { message: `fake stripe: unhandled ${req.method} ${pathname}` } });
});

server.listen(port, '127.0.0.1', () => console.log(`fake stripe listening on ${port}`));
