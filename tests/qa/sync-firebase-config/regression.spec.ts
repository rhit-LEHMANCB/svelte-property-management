import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'openspec/changes/sync-firebase-config/qa/screenshots';
const accounts = {
	admin: { email: process.env.QA_ADMIN_EMAIL ?? '', password: process.env.QA_ADMIN_PASSWORD ?? '' },
	tenant: { email: process.env.QA_TENANT_EMAIL ?? '', password: process.env.QA_TENANT_PASSWORD ?? '' }
};

async function signIn(page: Page, role: 'admin' | 'tenant') {
	const a = accounts[role];
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(a.email);
	await page.getByLabel('Password').fill(a.password);
	await page.screenshot({ path: `${SHOTS}/_unused.png`, mask: [page.getByLabel('Email'), page.getByLabel('Password')] }).catch(() => {});
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).not.toHaveURL(/\/signin/, { timeout: 30000 });
	await page.waitForLoadState('networkidle');
}

const pages: Record<'admin' | 'tenant', string[]> = {
	admin: ['/', '/admin', '/admin/properties', '/admin/users', '/admin/maintenance', '/maintenance', '/payment', '/insurance', '/profile'],
	tenant: ['/', '/maintenance', '/payment', '/insurance', '/profile']
};

for (const role of ['admin', 'tenant'] as const) {
	test(`regression: ${role} signs in and every page loads with real data`, async ({ page }) => {
		const errors: string[] = [];
		const bad: string[] = [];
		page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
		page.on('console', (m) => m.type() === 'error' && errors.push(`console ${m.text().slice(0, 200)}`));
		page.on('response', (r) => {
			if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(0, 160)}`);
		});
		await signIn(page, role);
		await page.screenshot({ path: `${SHOTS}/regression-${role}-after-signin.png` });
		const report: string[] = [];
		for (const p of pages[role]) {
			await page.goto(p);
			await page.waitForLoadState('networkidle');
			const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300);
			const imgs = await page.$$eval('img', (els) =>
				els.map((i) => ({ src: i.src, ok: i.complete && i.naturalWidth > 0 }))
			);
			report.push(`${p} -> ${page.url()} imgs=${imgs.length} broken=${imgs.filter((i) => !i.ok).length} :: ${text}`);
			const slug = p === '/' ? 'home' : p.slice(1).replace(/\//g, '-');
			await page.screenshot({ path: `${SHOTS}/regression-${role}-${slug}.png`, fullPage: true });
			fs.writeFileSync(`${SHOTS}/_${role}-imgs-${slug}.json`, JSON.stringify(imgs, null, 1));
		}
		console.log(`REPORT ${role}\n` + report.join('\n') + '\nBAD RESPONSES\n' + bad.join('\n') + '\nERRORS\n' + errors.join('\n'));
	});
}
