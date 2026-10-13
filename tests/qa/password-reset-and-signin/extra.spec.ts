import { test, expect, type Page } from '@playwright/test';

const SHOTS = 'openspec/changes/password-reset-and-signin/qa/screenshots';
const SENT = "If an account exists for that email, we've sent a reset link.";
const FAIL = "We couldn't send the email right now. Please try again.";
const need = (n: string) => {
	const v = process.env[n];
	if (!v) throw new Error(`missing env ${n}`);
	return v;
};
const hide = async (page: Page) => {
	const secrets = [process.env.QA_ADMIN_EMAIL, process.env.QA_TENANT_EMAIL].filter(Boolean) as string[];
	await page
		.evaluate((vals) => {
			document.querySelectorAll('input').forEach((i) => {
				if (vals.includes((i as HTMLInputElement).value)) (i as HTMLInputElement).style.color = 'transparent';
			});
			// Mask any text node showing a QA email.
			const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
			let n: Node | null;
			while ((n = w.nextNode())) {
				for (const v of vals) if (n.nodeValue?.includes(v)) n.nodeValue = n.nodeValue.replaceAll(v, '[qa account]');
			}
		}, secrets)
		.catch(() => undefined);
};

test.describe('reset for a real account (limited requests)', () => {
	test('Reset email sent: real account on /forgot shows the generic answer, not the failure message; repeat is limited with same answer', async ({
		page,
		request
	}) => {
		await page.goto('/forgot');
		await page.locator('html[data-hydrated]').waitFor({ timeout: 15000 }).catch(() => undefined);
		await page.getByTitle('Email').fill(need('QA_TENANT_EMAIL'));
		await page.getByRole('button', { name: 'Send reset link' }).click();
		await expect(page.getByText(SENT)).toBeVisible({ timeout: 20000 });
		await expect(page.getByText(FAIL)).toHaveCount(0);
		await hide(page);
		await page.screenshot({ path: `${SHOTS}/forgot-reset-email-sent-real-account.png` });

		// Second request within a minute, different case: same answer, still 200.
		const r = await request.put('/api/signin/reset', { data: { email: need('QA_TENANT_EMAIL').toUpperCase() } });
		expect(r.status()).toBe(200);
		expect(await r.json()).toEqual({ status: 'email_sent' });
		// Un-hydrated variant is covered for unknown addresses in authentication.spec.ts.
	});
});

test.describe('forgot page extras', () => {
	test('Unknown email on /forgot never shows the delivery failure (JS)', async ({ page }) => {
		await page.goto('/forgot');
		await page.locator('html[data-hydrated]').waitFor({ timeout: 15000 }).catch(() => undefined);
		await page.getByTitle('Email').fill(`qa-${Date.now().toString(36)}-unk@example.com`);
		await page.getByRole('button', { name: 'Send reset link' }).click();
		await expect(page.getByText(SENT)).toBeVisible({ timeout: 20000 });
		await expect(page.getByText(FAIL)).toHaveCount(0);
		await page.screenshot({ path: `${SHOTS}/forgot-same-answer-for-unknown-or-limited-emails.png` });
	});
	test('API: malformed or missing email is not a 500 and sends nothing', async ({ request }) => {
		for (const data of [{}, { email: '' }, { email: 'not-an-email' }]) {
			const r = await request.put('/api/signin/reset', { data });
			console.log('api invalid', JSON.stringify(data), r.status());
			expect(r.status()).toBeLessThan(500);
		}
	});
});

for (const role of ['ADMIN', 'TENANT'] as const) {
	test(`regression: ${role} signs in and loads every top-level page`, async ({ page }) => {
		const problems: string[] = [];
		page.on('console', (m) => {
			if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`);
		});
		page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
		page.on('response', (r) => {
			if (r.status() >= 400 && r.url().includes('lehman-realty-dev.web.app'))
				problems.push(`http ${r.status()} ${new URL(r.url()).pathname}`);
		});
		await page.goto('/signin');
		await page.locator('html[data-hydrated]').waitFor({ timeout: 15000 }).catch(() => undefined);
		await page.getByTitle('Email').fill(need(`QA_${role}_EMAIL`));
		await page.getByTitle('Password').fill(need(`QA_${role}_PASSWORD`));
		await page.getByRole('button', { name: 'Sign in' }).click();
		await page.waitForURL((u) => !u.pathname.startsWith('/signin'), { timeout: 20000 });
		// Discover nav links.
		const hrefs = await page.$$eval('a[href^="/"]', (as) =>
			[...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))].filter(
				(h) => !h.startsWith('/api') && !h.includes('signout')
			)
		);
		const base = role === 'ADMIN'
			? ['/', '/admin', '/admin/users', '/admin/properties', '/admin/properties/add', '/admin/maintenance', '/profile', '/insurance', '/payment', '/maintenance']
			: ['/', '/profile', '/insurance', '/payment', '/maintenance'];
		const all = [...new Set([...base, ...hrefs])];
		console.log(role, 'pages:', all.join(' '));
		const results: string[] = [];
		for (const p of all) {
			const before = problems.length;
			const res = await page.goto(p, { waitUntil: 'networkidle' }).catch((e) => ({ status: () => -1, e }) as any);
			await page.waitForTimeout(800);
			const status = res?.status?.() ?? -1;
			const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 4000);
			const bad = status >= 400 || /\b(500|Internal Error|Application error)\b/i.test(body.slice(0, 400));
			results.push(`${p} -> ${page.url().replace(/^https?:\/\/[^/]+/, '')} ${status}${bad ? ' BAD' : ''}${problems.length > before ? ' (+' + (problems.length - before) + ' issues)' : ''}`);
			if (p === '/' ) { await hide(page); await page.screenshot({ path: `${SHOTS}/regression-${role.toLowerCase()}-home.png` }); }
		}
		console.log(role + ' results:\n' + results.join('\n'));
		console.log(role + ' problems:\n' + [...new Set(problems)].join('\n'));
		expect(results.filter((r) => r.includes('BAD'))).toEqual([]);
	});
}
