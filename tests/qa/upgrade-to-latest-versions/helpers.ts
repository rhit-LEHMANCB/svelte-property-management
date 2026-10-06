import { expect, type Page, type TestInfo } from '@playwright/test';
import path from 'node:path';

export const SHOTS = path.resolve(
	process.cwd(),

	'openspec/changes/upgrade-to-latest-versions/qa/screenshots'
);

export function account(role: 'admin' | 'tenant') {
	const p = role === 'admin' ? 'QA_ADMIN' : 'QA_TENANT';
	const email = process.env[`${p}_EMAIL`];
	const password = process.env[`${p}_PASSWORD`];
	if (!email || !password) throw new Error(`environment: missing ${p}_EMAIL or ${p}_PASSWORD`);
	return { email, password };
}

export async function signIn(page: Page, role: 'admin' | 'tenant') {
	const a = account(role);
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(a.email);
	await page.getByLabel('Password').fill(a.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).not.toHaveURL(/\/signin/, { timeout: 30000 });
	await page.waitForLoadState('networkidle');
}

export async function shot(page: Page, name: string) {
	// Blur anything that looks like an email address or phone number (real personal data).
	await page
		.evaluate(() => {
			const re = /@|\(\d{3}\) \d{3}-\d{4}|\b\d{10}\b/;
			document.querySelectorAll('body *').forEach((el) => {
				const own = Array.from(el.childNodes)
					.filter((n) => n.nodeType === 3)
					.map((n) => n.textContent)
					.join(' ');
				if (re.test(own) || (el instanceof HTMLInputElement && re.test(el.value)))
					(el as HTMLElement).style.filter = 'blur(6px)';
			});
		})
		.catch(() => {});
	await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

/** Collect console errors and failed requests; attach to the page for later assertions/logging. */
export function watch(page: Page, label: string) {
	const issues: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error') issues.push(`[console] ${m.text().slice(0, 200)}`);
	});
	page.on('pageerror', (e) => issues.push(`[pageerror] ${e.message.slice(0, 200)}`));
	page.on('response', (r) => {
		if (r.status() >= 400) issues.push(`[http ${r.status()}] ${r.url().slice(0, 120)}`);
	});
	return {
		issues,
		report(info: TestInfo) {
			if (issues.length) console.log(`ISSUES ${label}: ${JSON.stringify(issues)}`);
		}
	};
}

export async function noHScroll(page: Page) {
	return page.evaluate(
		() => document.documentElement.scrollWidth <= document.documentElement.clientWidth
	);
}
