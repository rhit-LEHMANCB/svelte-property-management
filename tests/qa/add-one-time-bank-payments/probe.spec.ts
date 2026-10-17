import { test } from '@playwright/test';
import { signInAs } from '../add-autopay/support';
const json = { 'Content-Type': 'application/json' };
test('probe', async ({ page }) => {
	test.setTimeout(120000);
	await signInAs(page, 'tenant');
	for (const [method, amount] of [['card', 964.52 > 800 ? 600 : 1], ['bank', 600]] as const) {
		const r = await page.request.post('/api/stripe/create-checkout-session/payment', { data: { leaseId: 'IopO2Aqo5Glp3aY5CVqX', amount, method }, headers: json });
		const b = await r.json().catch(() => ({}));
		console.log('API', method, r.status(), JSON.stringify(Object.keys(b)));
		if (!b.url) continue;
		await page.goto(b.url);
		await page.waitForLoadState('networkidle').catch(() => {});
		await page.waitForTimeout(4000);
		console.log('PAGE', method, (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1500));
		await page.screenshot({ path: `/tmp/claude-0/probe-${method}.png` });
	}
});
