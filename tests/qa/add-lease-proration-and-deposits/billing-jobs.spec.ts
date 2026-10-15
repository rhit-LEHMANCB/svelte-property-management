import { test, expect, type Page } from '@playwright/test';
import {
	newSession, createProperty, createLease, remember, openLeases, shot, cleanup
} from './helpers';

// Covers billing-jobs, plus the amended lease-billing scenarios that need the job or a lease dated
// relative to today (rent payable 7 days early, waive refusing an uncharged month).
const CAP = 'billing-jobs';
const TODAY = '2026-10-15';
let admin: Page;
let tenant: Page;
let prop = '';
const ids: Record<string, string> = {};
const runs: Record<string, any> = {};

type Summary = { date: string; leases: number; feesCharged: number; emailsSent: number; errors: number } & Record<string, unknown>;

test.describe.configure({ mode: 'serial' });

const entry = (page: Page, start: string) =>
	page
		.locator('ul[aria-label="Leases"] > li')
		.filter({ has: page.getByRole('link', { name: `Edit lease from ${start}` }) });
const entryText = async (page: Page, start: string) => (await entry(page, start).innerText()).replace(/\s+/g, ' ');

/** Render a JSON result on the page so it can be screenshotted (no account data is in these). */
async function showJson(page: Page, title: string, data: unknown) {
	await page.evaluate(
		({ title, text }) => {
			document.body.innerHTML = '';
			const h = document.createElement('h2');
			h.textContent = title;
			const pre = document.createElement('pre');
			pre.textContent = text;
			pre.style.cssText = 'font:16px monospace;padding:16px;white-space:pre-wrap';
			h.style.cssText = 'font:bold 18px sans-serif;padding:16px 16px 0';
			document.body.append(h, pre);
		},
		{ title, text: JSON.stringify(data, null, 2) }
	);
}

async function runJob(page: Page) {
	return page.evaluate(async () => {
		const r = await fetch('/api/jobs/daily', { method: 'POST' });
		return { status: r.status, body: await r.json().catch(() => null) };
	});
}

test.beforeAll(async ({ browser }) => {
	test.setTimeout(300_000);
	admin = await newSession(browser, 'admin');
	tenant = await newSession(browser, 'tenant');
});

test.afterAll(async () => {
	if (!admin) return;
	const left = await cleanup(admin, Object.values(ids), prop ? [prop] : []);
	console.log('billing-jobs cleanup, leases left:', left.length);
	await admin.context().close();
	await tenant.context().close();
});

test.describe('Daily run', () => {
	test('Anyone else', async ({ browser }) => {
		const anon = await browser.newContext({ baseURL: 'https://lehman-realty-dev.web.app' });
		const none = await anon.request.post('/api/jobs/daily');
		const wrong = await anon.request.post('/api/jobs/daily', { headers: { Authorization: 'Bearer not-the-secret' } });
		const asTenant = await tenant.request.post('/api/jobs/daily');
		expect([none.status(), wrong.status(), asTenant.status()]).toEqual([401, 401, 401]);
		await anon.close();
		await admin.goto('/admin/properties');
		await showJson(admin, 'POST /api/jobs/daily (role -> status)', {
			'no credentials': none.status(),
			'wrong bearer secret': wrong.status(),
			'signed-in tenant': asTenant.status(),
			'tenant body': await asTenant.json()
		});
		await shot(admin, `${CAP}-anyone-else`, false);
	});

	for (const name of ['Scheduler with the secret', 'No secret configured']) {
		test(name, async () => {
			test.skip(true, 'not verified: QA has no JOBS_SECRET and cannot see whether the dev environment has one');
		});
	}
});

test.describe('Setup', () => {
	test('Create a qa- property with an ended unpaid lease for the QA tenant', async () => {
		test.setTimeout(180_000);
		prop = await createProperty(admin, 'qa-jobs-ended', 1000, 'jobs QA Way');
		remember('property', prop);
		// The QA tenant's own lease is month to month from 2026-10-01, so only a lease that ended before
		// that can be created without overlapping it. Rent and the deposit (due today) are unpaid.
		ids.ended = await createLease(admin, prop, {
			rent: 1000, start: '2026-08-01', end: '2026-09-30', deposit: 500, depositDue: TODAY, lateFee: 75, grace: 5
		});
		remember('lease', ids.ended, prop);
	});
});

test.describe('Daily run (admin)', () => {
	test('Admin runs it on demand', async () => {
		await admin.goto('/admin/properties');
		await admin.waitForLoadState('networkidle');
		const r = await runJob(admin);
		runs.baseline = r;
		expect(r.status).toBe(200);
		expect(r.body).toMatchObject({ date: TODAY });
		expect(r.body.leases).toBeGreaterThanOrEqual(6);
		console.log('RUN baseline', JSON.stringify(r));
		await showJson(admin, 'Admin POST /api/jobs/daily (after the QA ended lease exists)', r);
		await shot(admin, `${CAP}-admin-runs-it-on-demand`, false);
	});

});

test.describe('Late fee charged once per late month', () => {
	test('Before the late-fee start date', async () => {
		// August and September are unpaid and long past grace, but were due before the lease was created today.
		await openLeases(admin, prop);
		const before = await entryText(admin, '2026-08-01');
		console.log('ENDED before run', before);
		expect(before).toContain('Owed $2,500.00');
		const r = runs.baseline;
		expect(r.status).toBe(200);
		expect((r.body as Summary).feesCharged).toBe(0);
		expect((r.body as Summary).errors).toBe(0);
		await openLeases(admin, prop);
		const after = await entryText(admin, '2026-08-01');
		expect(after).toContain('Owed $2,500.00');
		expect(after).not.toContain('Late fee');
		await expect(entry(admin, '2026-08-01').getByRole('list', { name: 'Late fees' })).toHaveCount(0);
		await shot(admin, 'lease-billing-before-the-late-fee-start-date');
		await tenant.goto('/payment');
		await tenant.waitForLoadState('networkidle');
		await expect(tenant.locator(`[data-lease="${ids.ended}"]`)).toContainText('$2,500.00');
		await expect(tenant.locator(`[data-lease="${ids.ended}"]`)).not.toContainText(/late fee(?!s first)/i);
		await tenant.locator(`[data-lease="${ids.ended}"]`).scrollIntoViewIfNeeded();
		await shot(tenant, 'lease-billing-late-fee-not-owed-until-charged');
	});

	for (const n of ['Unpaid after grace', 'Before the run', 'Paid within grace', 'Paid after the fee', 'Paid late but before the run', 'Missed run', 'Unpaid deposit']) {
		test(n, async () => {
			test.skip(true, 'not verified: needs a month due on or after the lease creation day whose grace days have passed; a lease created today has none, and the late-fee start date cannot be set');
		});
	}
});

test.describe('Waive a late fee', () => {
	test('Waive refuses a month with no charged fee', async () => {
		const res = await admin.request.post(`/api/lease/${ids.ended}/late-fees/2026-08/waive`);
		const body = await res.json().catch(() => null);
		const unknown = await admin.request.post('/api/lease/doesnotexist123/late-fees/2026-08/waive');
		console.log('WAIVE none', res.status(), JSON.stringify(body), unknown.status());
		expect(res.status()).toBe(404);
		expect(unknown.status()).toBe(404);
		await openLeases(admin, prop);
		await expect(entry(admin, '2026-08-01').getByRole('list', { name: 'Late fees' })).toHaveCount(0);
		await admin.goto('/admin/properties');
		await showJson(admin, 'Admin waive for a month with no charged fee', { status: res.status(), body, unknownLease: unknown.status() });
		await shot(admin, 'lease-billing-waive-refuses-uncharged-month', false);
	});

	test('Tenant tries to waive', async () => {
		const res = await tenant.request.post(`/api/lease/${ids.ended}/late-fees/2026-08/waive`);
		expect(res.status()).toBe(401);
		await admin.goto('/admin/properties');
		await showJson(admin, 'Signed-in tenant waive request', { status: res.status(), body: await res.json() });
		await shot(admin, 'lease-billing-tenant-tries-to-waive', false);
	});

	test('Waive', async () => {
		test.skip(true, 'not verified: no late fee can be charged yet, so there is none to waive');
	});
});

test.describe('Run and repeat', () => {
	test('Ended lease sends no reminders', async () => {
		// The ended lease owes unpaid rent and a deposit due today; the run above sent nothing.
		expect((runs.baseline.body as Summary).emailsSent).toBe(0);
		await openLeases(admin, prop);
		await shot(admin, `${CAP}-ended-lease`);
	});

	test('Summary', async () => {
		const s = runs.baseline.body as Summary;
		expect(Object.keys(s)).toEqual(expect.arrayContaining(['date', 'leases', 'feesCharged', 'emailsSent', 'errors']));
		await admin.goto('/admin/properties');
		await showJson(admin, 'Run summary response', runs.baseline);
		await shot(admin, `${CAP}-summary`, false);
	});

	// The daily route may be called as admin at most 3 times per QA cycle: the baseline above plus
	// this one pair of simultaneous calls. The pair is both the repeat run and the overlapping calls.
	let pair: { status: number; body: any }[] = [];
	test('Run again the same day', async () => {
		pair = await Promise.all([runJob(admin), runJob(admin)]);
		console.log('RUN pair', JSON.stringify(pair));
		const done = pair.filter((x) => x.status === 200);
		expect(done.length).toBeGreaterThanOrEqual(1);
		for (const r of done) {
			expect((r.body as Summary).emailsSent).toBe(0);
			expect((r.body as Summary).feesCharged).toBe(0);
		}
		await admin.goto('/admin/properties');
		await showJson(admin, 'Run again the same day', done[0]);
		await shot(admin, `${CAP}-run-again-the-same-day`, false);
	});

	test('Overlapping calls', async () => {
		const statuses = pair.map((x) => x.status).sort();
		expect(statuses.every((x) => x === 200 || x === 409)).toBe(true);
		test.info().annotations.push({ type: 'statuses', description: statuses.join(',') });
		await admin.goto('/admin/properties');
		await showJson(admin, 'Two simultaneous calls', pair);
		await shot(admin, `${CAP}-overlapping-calls`, false);
	});

	for (const name of [
		'Overlapping runs never send twice', 'Fee charged', 'Email fails', 'Seven days before', 'On the due day', 'Already paid', 'Deposit due'
	]) {
		test(name, async () => {
			test.skip(true, 'not verified: needs a lease for the QA tenant that starts in the future or is due today; the QA tenant has an open-ended lease from 2026-10-01, so any such lease would overlap it');
		});
	}
});
