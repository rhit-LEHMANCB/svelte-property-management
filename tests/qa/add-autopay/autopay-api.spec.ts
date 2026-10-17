import { expect, request as pwRequest, test } from '@playwright/test';
import { CREDIT_LEASE, shot, signInAs } from './support';

const base = process.env.BASE_URL?.trim() || 'https://lehman-realty-dev.web.app';
const json = { 'Content-Type': 'application/json' };

test.describe('autopay API', () => {
	test('Not signed in: every autopay route answers 401', async ({ page }) => {
		const anon = await pwRequest.newContext({ baseURL: base });
		const calls = [
			await anon.post('/api/autopay/setup', { data: { leaseId: CREDIT_LEASE }, headers: json }),
			await anon.post('/api/autopay/complete', { data: { sessionId: 'cs_test_x' }, headers: json }),
			await anon.patch('/api/autopay', {
				data: { leaseId: CREDIT_LEASE, amount: 5 },
				headers: json
			}),
			await anon.delete('/api/autopay', { data: { leaseId: CREDIT_LEASE }, headers: json })
		];
		expect(calls.map((c) => c.status())).toEqual([401, 401, 401, 401]);
		await page.goto('/signin');
		await shot(page, 'access-not-signed-in');
	});

	test('Not the tenant lease or bad amount: 403 and 400, no session', async ({ page }) => {
		await signInAs(page, 'tenant');
		const post = (data: unknown) =>
			page.request.post('/api/autopay/setup', { data, headers: json });
		const results: Record<string, number> = {};
		results.unknownLease = (await post({ leaseId: 'qa-does-not-exist', amount: null })).status();
		results.missingLease = (await post({ amount: 10 })).status();
		results.zero = (await post({ leaseId: CREDIT_LEASE, amount: 0 })).status();
		results.negative = (await post({ leaseId: CREDIT_LEASE, amount: -5 })).status();
		results.threeDecimals = (await post({ leaseId: CREDIT_LEASE, amount: 1.234 })).status();
		results.text = (await post({ leaseId: CREDIT_LEASE, amount: 'abc' })).status();
		console.log('setup validation', JSON.stringify(results));
		expect(results.unknownLease).toBe(403);
		expect([400, 403]).toContain(results.missingLease);
		for (const k of ['zero', 'negative', 'threeDecimals', 'text']) expect(results[k], k).toBe(400);
		await page.goto('/payment');
		await shot(page, 'setup-validation-errors');
	});

	test('Admin is not on the lease: setup, change and turn off are refused', async ({ page }) => {
		await signInAs(page, 'admin');
		const s = await page.request.post('/api/autopay/setup', {
			data: { leaseId: CREDIT_LEASE, amount: null },
			headers: json
		});
		const p = await page.request.patch('/api/autopay', {
			data: { leaseId: CREDIT_LEASE, amount: 5 },
			headers: json
		});
		const d = await page.request.delete('/api/autopay', {
			data: { leaseId: CREDIT_LEASE },
			headers: json
		});
		console.log('admin write attempts', s.status(), p.status(), d.status());
		expect(s.status()).toBe(403);
		expect([403, 404]).toContain(p.status());
		expect([403, 404]).toContain(d.status());
		await page.goto('/admin');
		await shot(page, 'admin-read-only-api');
	});

	test('Only your own: change/turn off with no enrollment or a foreign lease', async ({ page }) => {
		await signInAs(page, 'tenant');
		const p1 = await page.request.patch('/api/autopay', {
			data: { leaseId: CREDIT_LEASE, amount: 5 },
			headers: json
		});
		const d1 = await page.request.delete('/api/autopay', {
			data: { leaseId: CREDIT_LEASE },
			headers: json
		});
		const p2 = await page.request.patch('/api/autopay', {
			data: { leaseId: 'qa-does-not-exist', amount: 5 },
			headers: json
		});
		const d2 = await page.request.delete('/api/autopay', {
			data: { leaseId: 'qa-does-not-exist' },
			headers: json
		});
		console.log('own-only', p1.status(), d1.status(), p2.status(), d2.status());
		expect([403, 404]).toContain(p1.status());
		expect([403, 404]).toContain(d1.status());
		expect([403, 404]).toContain(p2.status());
		expect([403, 404]).toContain(d2.status());
		await page.goto('/payment');
		await shot(page, 'change-only-your-own');
	});

	test("Someone else's or unfinished session: nothing saved, 400/403", async ({ page }) => {
		await signInAs(page, 'tenant');
		const bogus = await page.request.post('/api/autopay/complete', {
			data: { sessionId: 'cs_test_qa_bogus' },
			headers: json
		});
		const empty = await page.request.post('/api/autopay/complete', { data: {}, headers: json });
		// An unfinished session: start one and complete it before the card is entered.
		const start = await page.request.post('/api/autopay/setup', {
			data: { leaseId: CREDIT_LEASE, amount: 12.5 },
			headers: json
		});
		expect(start.status()).toBe(200);
		const body = await start.json();
		const text = JSON.stringify(body);
		expect(text).not.toMatch(/pm_[A-Za-z0-9]/);
		expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
		const id = String(body.url).match(/cs_test_[A-Za-z0-9]+/)?.[0];
		console.log('unfinished session id found:', Boolean(id));
		const unfinished = id
			? await page.request.post('/api/autopay/complete', { data: { sessionId: id }, headers: json })
			: null;
		console.log('complete statuses', bogus.status(), empty.status(), unfinished?.status());
		expect([400, 403]).toContain(bogus.status());
		expect([400, 403]).toContain(empty.status());
		if (unfinished) expect([400, 403]).toContain(unfinished.status());
		await page.goto('/payment');
		await shot(page, 'complete-unfinished-session');
	});
});
