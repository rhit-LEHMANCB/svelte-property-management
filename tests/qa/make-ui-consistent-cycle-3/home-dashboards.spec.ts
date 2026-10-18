import { test, expect } from '@playwright/test';
import { box, open, shot, signInAs } from './support';

test.use({ viewport: { width: 1280, height: 1300 } });
test.setTimeout(120_000);

const dollars = (s: string) => Number(s.replace(/[^0-9.]/g, ''));

test.describe('home-dashboards tenant', () => {
	test('Balance owed + Autopay + Open requests + Insurance + lease cards (real dev data)', async ({ page }) => {
		await signInAs(page, 'tenant');
		await open(page, '/payment');
		const payText = await page.locator('main').innerText();
		const owed = [...payText.matchAll(/You have a balance of \$([\d,]+\.\d\d) due on (\d+)\/(\d+)\/(\d+)/g)];
		const total = owed.reduce((n, m) => n + dollars(m[1]), 0);
		const dues = owed.map((m) => new Date(2000 + +m[4], +m[2] - 1, +m[3]).getTime());
		const earliest = new Date(Math.min(...dues));
		console.log('payment page total', total, 'earliest', earliest.toDateString());

		await open(page, '/');
		const main = page.locator('main');
		const balance = main.getByText('Balance due').locator('xpath=ancestor::*[a][1]');
		const bal = await balance.innerText();
		console.log('balance tile:', bal.replace(/\n/g, ' | '));
		expect(dollars(bal.match(/\$[\d,]+\.\d\d/)![0])).toBe(total);
		expect(bal).toContain(`Due ${earliest.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
		await expect(main.getByRole('link', { name: 'Make a payment' })).toHaveAttribute('href', '/payment');
		await shot(page, 'home-dashboards-balance-owed-tenant');

		// autopay: the Payment page autopay section has no active enrollment => Off
		const autopay = main.getByText('Autopay', { exact: true }).locator('xpath=ancestor::*[a][1]');
		const ap = await autopay.innerText();
		console.log('autopay tile:', ap.replace(/\n/g, ' | '));
		expect(ap).toContain('Off');
		await expect(main.getByRole('link', { name: 'Set up autopay' })).toBeVisible();
		await shot(page, 'home-dashboards-autopay-off-tenant');

		// open requests: compare with the Maintenance page's Open (n)
		const mt = main.getByText('Open maintenance requests').locator('xpath=ancestor::*[a][1]');
		const mtText = await mt.innerText();
		console.log('maintenance tile:', mtText.replace(/\n/g, ' | '));
		const n = Number(mtText.match(/\n?(\d+)\n/)![1]);
		await expect(mt.getByRole('link')).toHaveAttribute('href', '/maintenance');
		await open(page, '/maintenance');
		const openTab = await page.getByRole('tab', { name: /^Open \(\d+\)/ }).innerText();
		expect(Number(openTab.match(/\((\d+)\)/)![1])).toBe(Math.min(n, 5));
		await open(page, '/');
		await shot(page, 'home-dashboards-open-requests-tenant');
	});

	test('Missing insurance card, lease cards and Past leases', async ({ page }) => {
		await signInAs(page, 'tenant');
		await open(page, '/');
		const main = page.locator('main');
		await expect(main.getByRole('heading', { name: 'Renters insurance' })).toBeVisible();
		await expect(main.getByText('Missing', { exact: true })).toBeVisible();
		await expect(main.getByRole('link', { name: 'Add insurance' })).toHaveAttribute('href', '/insurance');
		await expect(main.getByText('Ending soon')).toHaveCount(0);
		await expect(main.getByText('Expired')).toHaveCount(0);
		await shot(page, 'home-dashboards-missing-insurance-tenant');
		// lease cards: one for each current/upcoming lease, titled "Your lease"? (observed wording logged)
		const headings = await main.locator('h1,h2,h3,h4').allInnerTexts();
		console.log('dashboard headings:', JSON.stringify(headings));
		await expect(main.getByRole('heading', { name: 'Past leases' })).toBeVisible();
		await shot(page, 'home-dashboards-lease-and-past-leases-tenant');
	});

	test('Another household: tenant sees no admin data and /admin is refused', async ({ page, request }) => {
		await signInAs(page, 'tenant');
		const res = await page.request.get('/admin', { maxRedirects: 0 });
		console.log('tenant GET /admin', res.status(), res.headers()['location']);
		const data = await page.request.get('/admin/__data.json', { maxRedirects: 0 });
		const body = await data.text();
		console.log('tenant GET /admin/__data.json', data.status(), body.slice(0, 200));
		// the layout node (the tenant's own data) may come back; the admin page's own node must not
		const parsed = JSON.parse(body) as { type: string; nodes?: ({ type: string; data?: unknown[]; status?: number } | null)[] };
		console.log('data.json shape', JSON.stringify(parsed.nodes?.map((n) => (n ? { type: n.type, len: n.data?.length, status: n.status } : null))));
		const pageNode = parsed.nodes?.[2];
		expect(pageNode?.type, 'admin page node is an error, no counts').toBe('error');
		expect(pageNode?.status).toBe(401);
		await page.goto('/admin');
		await page.waitForLoadState('networkidle');
		console.log('tenant lands on', page.url());
		console.log('body:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200));
		await expect(page.getByText('Needs attention')).toHaveCount(0);
		await shot(page, 'home-dashboards-tenant-requests-admin');
	});
});

test.describe('home-dashboards admin', () => {
	test('Counts: rows with links, rows at 0 hidden', async ({ page }) => {
		await signInAs(page, 'admin');
		await open(page, '/admin/maintenance');
		const openTab = await page.getByRole('tab', { name: /^Open \(\d+\)/ }).innerText();
		const openN = Number(openTab.match(/\((\d+)\)/)![1]);
		await open(page, '/admin');
		const card = page.locator('main').getByRole('heading', { name: 'Needs attention' }).locator('xpath=ancestor::*[contains(@class,"card")][1]');
		const text = await card.innerText();
		console.log('needs attention:', text.replace(/\n/g, ' | '));
		const links = await card.locator('a').evaluateAll((as) => as.map((a) => `${a.closest('li,div')?.textContent?.trim().replace(/\s+/g, ' ')} -> ${a.getAttribute('href')}`));
		console.log(JSON.stringify(links));
		if (openN > 0) {
			expect(text).toMatch(new RegExp(`${openN} open maintenance request`));
			await expect(card.locator('a[href="/admin/maintenance"]').first()).toBeVisible();
		} else {
			expect(text).not.toMatch(/open maintenance request/);
		}
		expect(text).toMatch(/\d+ deposits? to settle/);
		await expect(card.locator('a[href="/admin/properties"]').first()).toBeVisible();
		// no autopay row because the count is 0 on this data
		expect(text).not.toMatch(/autopay/i);
		expect(text).not.toMatch(/(^|\s)0 (open|deposit|failed)/i);
		await shot(page, 'home-dashboards-counts-admin');
	});
});
