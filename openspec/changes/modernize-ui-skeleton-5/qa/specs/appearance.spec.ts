import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { hydrate, measureContrast, selfTestMeasure, shot, signIn } from './helpers';
import { QA_USER_EMAIL, qaPropertyUrl, waitReady } from './data';

type Mode = 'light' | 'dark';

const DIALOG = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

async function newContext(browser: Browser, mode: Mode, viewport = { width: 1280, height: 800 }) {
	const context = await browser.newContext({ colorScheme: mode, viewport });
	await context.addInitScript((m) => {
		try {
			localStorage.setItem('theme', m);
		} catch {
			/* ignore */
		}
	}, mode);
	return context;
}

type Row = { where: string; text: string; ratio?: number; need?: number; fg?: string; bg?: string; note?: string };

async function audit(page: Page, where: string, rows: Row[], stats: string[], scope?: string) {
	const res = await measureContrast(page, scope);
	stats.push(
		`${where}: ${res.checked} text items, ${res.exemptCount} in filled controls, ${res.links ?? 0} links` +
			(res.exemptLow?.length ? `; filled below AA (accepted): ${res.exemptLow.map((e) => `${e.text}=${e.ratio}`).join(', ')}` : '')
	);
	if (res.disabledLow?.length) stats.push(`  (disabled controls exempt from AA, below 4.5: ${res.disabledLow.map((d) => `${d.text}=${d.ratio}`).join(', ')})`);
	for (const f of res.failures) rows.push({ where, ...f });
}

async function auditAdminPages(page: Page, mode: Mode, rows: Row[], stats: string[]) {
	const go = async (url: string) => {
		await page.goto(url);
		await waitReady(page);
	};
	for (const url of ['/admin', '/admin/properties', '/admin/maintenance', '/profile', '/admin/properties/add']) {
		await go(url);
		await audit(page, `${mode} ${url}`, rows, stats);
	}
	// users page and the overlays that open from it
	await go('/admin/users');
	await audit(page, `${mode} /admin/users`, rows, stats);
	await page.getByRole('button', { name: 'Actions for Caleb Lehman' }).hover();
	await page.getByRole('button', { name: 'Actions for Caleb Lehman' }).click();
	await expect(page.getByRole('menu')).toBeVisible();
	await audit(page, `${mode} row menu`, rows, stats, '[role="menu"][data-state="open"]');
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	const dlg = page.locator(DIALOG);
	await expect(dlg).toBeVisible();
	await audit(page, `${mode} confirm dialog`, rows, stats, DIALOG);
	if (mode === 'dark') await shot(page, 'appearance-contrast-in-dark-mode');
	await page.keyboard.press('Escape');
	await expect(dlg).toBeHidden();
	await page.getByRole('button', { name: 'Add User' }).click();
	await expect(dlg).toBeVisible();
	await audit(page, `${mode} prompt dialog`, rows, stats, DIALOG);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Actions for Caleb Lehman' }).click();
	await page.getByRole('menuitem', { name: 'View More' }).click();
	await expect(dlg).toBeVisible();
	await page.waitForTimeout(800);
	await audit(page, `${mode} user-info dialog (Info)`, rows, stats, DIALOG);
	for (const tab of ['Insurance', 'Emergency Info']) {
		await dlg.getByRole('tab', { name: tab }).click();
		await audit(page, `${mode} user-info dialog (${tab})`, rows, stats, DIALOG);
	}
	if (mode === 'light') await shot(page, 'appearance-contrast-in-light-mode');
	await page.keyboard.press('Escape');
	// search with no matches
	await page.getByPlaceholder('Search users').fill('zzzzqq');
	await audit(page, `${mode} users no results`, rows, stats);
	await page.getByPlaceholder('Search users').fill('');
	// qa property: tabs, combobox
	const url = await qaPropertyUrl(page);
	await go(url);
	await audit(page, `${mode} property edit: Info`, rows, stats);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Successfully added info.')).toBeVisible();
	await page.waitForTimeout(900);
	await audit(page, `${mode} success toast + form page`, rows, stats);
	await page.getByRole('tab', { name: 'Photos' }).click();
	await audit(page, `${mode} property edit: Photos`, rows, stats);
	await page.getByRole('tab', { name: 'Tenants' }).click();
	await audit(page, `${mode} property edit: Tenants`, rows, stats);
	const input = page.getByRole('combobox', { name: 'Tenant' });
	await input.click();
	await expect(page.getByRole('listbox')).toBeVisible();
	await audit(page, `${mode} combobox list`, rows, stats, '[role="listbox"][data-state="open"]');
	await input.pressSequentially('zzzzqq');
	await expect(page.getByText('No results found.')).toBeVisible();
	await audit(page, `${mode} combobox no results`, rows, stats, '[role="listbox"][data-state="open"]');
	await page.keyboard.press('Escape');
	// phone drawer
	await page.setViewportSize({ width: 390, height: 844 });
	await go('/admin/users');
	await audit(page, `${mode} users at 390px (cards)`, rows, stats);
	await page.locator('button[aria-label="Open menu"]').click();
	await expect(page.locator(DIALOG)).toBeVisible();
	await audit(page, `${mode} navigation drawer`, rows, stats, DIALOG);
	await page.keyboard.press('Escape');
	await page.setViewportSize({ width: 1280, height: 800 });
}

async function auditTenantPages(page: Page, mode: Mode, rows: Row[], stats: string[]) {
	for (const url of ['/', '/maintenance', '/payment', '/payment/success', '/insurance', '/profile']) {
		await page.goto(url);
		await waitReady(page);
		await audit(page, `${mode} tenant ${url}`, rows, stats);
	}
}

async function auditSignIn(browser: Browser, mode: Mode, rows: Row[], stats: string[]) {
	const ctx = await newContext(browser, mode);
	const p = await ctx.newPage();
	await p.goto('/signin');
	await hydrate(p);
	await selfTestMeasure(p);
	await audit(p, `${mode} /signin`, rows, stats);
	await shot(p, `appearance-signin-${mode}`);
	await p.goto('/reset');
	await audit(p, `${mode} /reset`, rows, stats);
	await p.goto('/signin');
	await hydrate(p);
	await p.getByLabel('Email').fill('qa-nobody@example.com');
	await p.getByLabel('Password').fill('not-a-real-password-qa');
	await p.getByRole('button', { name: 'Sign in' }).click();
	await expect(p.getByRole('alert')).toBeVisible({ timeout: 20000 });
	await p.waitForTimeout(900);
	await audit(p, `${mode} error toast on /signin`, rows, stats);
	await ctx.close();
}

async function contrastRun(browser: Browser, mode: Mode) {
	const rows: Row[] = [];
	const stats: string[] = [];
	await auditSignIn(browser, mode, rows, stats);
	for (const role of ['admin', 'tenant'] as const) {
		const ctx: BrowserContext = await newContext(browser, mode);
		const page = await ctx.newPage();
		await signIn(page, role);
		await page.evaluate((m) => localStorage.setItem('theme', m), mode);
		await page.reload();
		await waitReady(page);
		expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(mode === 'dark');
		await selfTestMeasure(page);
		if (role === 'admin') await auditAdminPages(page, mode, rows, stats);
		else await auditTenantPages(page, mode, rows, stats);
		await ctx.close();
	}
	console.log(`--- ${mode} mode coverage\n${stats.join('\n')}`);
	if (rows.length) {
		// de-duplicate for a readable log
		const seen = new Set<string>();
		const lines = rows
			.map((r) => `${r.where} | "${r.text}" ${r.tag ?? ''}${r.ratio ? ` ${r.ratio}:1 (need ${r.need}) fg=${r.fg} bg=${r.bg}` : ''}${r.note ?? ''}`)
			.filter((l) => !seen.has(l) && seen.add(l));
		console.log(`--- ${mode} mode FAILURES (${lines.length})\n${lines.join('\n')}`);
	}
	return rows.filter((r) => !r.note);
}

test('Contrast in light mode', async ({ browser }) => {
	test.setTimeout(300000);
	const failures = await contrastRun(browser, 'light');
	expect(failures, 'text or links below AA outside filled color controls (light)').toEqual([]);
});

test('Contrast in dark mode', async ({ browser }) => {
	test.setTimeout(300000);
	const failures = await contrastRun(browser, 'dark');
	expect(failures, 'text or links below AA outside filled color controls (dark)').toEqual([]);
});

test('Filled color controls are an accepted exception', async ({ browser }) => {
	for (const mode of ['light', 'dark'] as Mode[]) {
		const ctx = await newContext(browser, mode);
		const page = await ctx.newPage();
		await signIn(page, 'admin');
		await page.evaluate((m) => localStorage.setItem('theme', m), mode);
		await page.goto('/admin/users');
		await waitReady(page);
		const res = await page.evaluate(() => {
			const probe = (varName: string) => {
				const d = document.createElement('span');
				d.style.color = `var(${varName})`;
				document.body.appendChild(d);
				const c = getComputedStyle(d).color;
				d.remove();
				return c;
			};
			const btn = document.querySelector('button.preset-filled-primary-500') as HTMLElement;
			const nav = document.querySelector('nav a[aria-current="page"]') as HTMLElement;
			return {
				btnColor: getComputedStyle(btn).color,
				navColor: getComputedStyle(nav).color,
				navClass: nav.className,
				contrastVar: probe('--color-primary-contrast-500')
			};
		});
		// the theme's own text pairing: not overridden by app CSS
		expect(res.btnColor).toBe(res.contrastVar);
		expect(res.navColor).toBe(res.contrastVar);
		expect(res.navClass).toContain('preset-filled-primary-500');
		if (mode === 'dark') await shot(page, 'appearance-filled-color-controls-are-an-accepted-exception');
		await ctx.close();
	}
});

test('System prefers dark: first-time visitor sees dark', async ({ browser }) => {
	// no saved choice: a fresh context with the system preference only
	const ctx = await browser.newContext({ colorScheme: 'dark' });
	const p = await ctx.newPage();
	await p.goto('/signin');
	await hydrate(p);
	expect(await p.evaluate(() => localStorage.getItem('theme'))).toBeNull();
	expect(await p.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
	const lum = await p.evaluate(() => {
		const c = getComputedStyle(document.body).backgroundColor;
		const cv = document.createElement('canvas');
		cv.width = cv.height = 1;
		const cx = cv.getContext('2d')!;
		cx.fillStyle = c;
		cx.fillRect(0, 0, 1, 1);
		const [r, g, b] = cx.getImageData(0, 0, 1, 1).data;
		return (r + g + b) / 3;
	});
	expect(lum).toBeLessThan(80);
	await shot(p, 'appearance-system-prefers-dark');
	// also an authenticated page, in a different fresh context
	const ctx2 = await browser.newContext({ colorScheme: 'dark' });
	const p2 = await ctx2.newPage();
	await signIn(p2, 'tenant');
	expect(await p2.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
	await ctx.close();
	await ctx2.close();
	// and a light-preferring first-time visitor stays light
	const ctx3 = await browser.newContext({ colorScheme: 'light' });
	const p3 = await ctx3.newPage();
	await p3.goto('/signin');
	expect(await p3.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);
	await ctx3.close();
});

test('No flash: a dark preference is never first painted light', async ({ browser }) => {
	const ctx = await browser.newContext({ colorScheme: 'dark' });
	await ctx.addInitScript(() => {
		const w = window as unknown as { __log: string[] };
		w.__log = [];
		const snap = (why: string) => {
			const root = document.documentElement;
			const bg = document.body ? getComputedStyle(document.body).backgroundColor : 'no-body';
			w.__log.push(`${why}|${root.className}|${bg}`);
		};
		new MutationObserver(() => snap('class-mutation')).observe(document, {
			subtree: true,
			attributes: true,
			attributeFilter: ['class']
		});
		new PerformanceObserver((list) => {
			for (const e of list.getEntries()) snap(`paint:${e.name}`);
		}).observe({ type: 'paint', buffered: true });
		document.addEventListener('DOMContentLoaded', () => snap('DOMContentLoaded'));
		requestAnimationFrame(() => snap('first-raf'));
	});
	const p = await ctx.newPage();
	await p.goto('/signin');
	await hydrate(p);
	await p.waitForTimeout(500);
	const log = await p.evaluate(() => (window as unknown as { __log: string[] }).__log);
	console.log(log.join('\n'));
	expect(log.length).toBeGreaterThan(0);
	for (const entry of log) {
		const [, cls] = entry.split('|');
		expect(cls, entry).not.toContain('light');
	}
	// at first paint the root class was already dark
	const paints = log.filter((l) => l.startsWith('paint:'));
	for (const l of paints) expect(l.split('|')[1]).toContain('dark');
	await shot(p, 'appearance-no-flash');
	// and on a server-rendered page behind sign-in
	await signIn(p, 'admin');
	await p.goto('/admin/users');
	await hydrate(p);
	const log2 = await p.evaluate(() => (window as unknown as { __log: string[] }).__log);
	console.log(log2.join('\n'));
	expect(log2.length).toBeGreaterThan(0);
	for (const entry of log2) expect(entry.split('|')[1], entry).not.toContain('light');
	for (const l of log2.filter((x) => x.startsWith('paint:'))) expect(l.split('|')[1]).toContain('dark');
	await ctx.close();
});

test('Toggle and reload', async ({ browser }) => {
	const ctx = await browser.newContext({ colorScheme: 'light' });
	const page = await ctx.newPage();
	await signIn(page, 'admin');
	await waitReady(page);
	const toggle = page.getByRole('button', { name: 'Dark mode' });
	await expect(toggle).toBeVisible();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await toggle.click();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await page.reload();
	await waitReady(page);
	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(page.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'true');
	// remembered across sign-in sessions: sign out and sign in again in the same browser
	await page.getByRole('button', { name: 'Sign out' }).click();
	await page.waitForURL(/\/signin/);
	await expect(page.locator('html')).toHaveClass(/dark/);
	await signIn(page, 'admin');
	await expect(page.locator('html')).toHaveClass(/dark/);
	await shot(page, 'appearance-toggle-and-reload');
	// put it back for the context
	await page.getByRole('button', { name: 'Dark mode' }).click();
	await ctx.close();
});

test('Override the system', async ({ browser }) => {
	const ctx = await browser.newContext({ colorScheme: 'dark' });
	const page = await ctx.newPage();
	await signIn(page, 'admin');
	await waitReady(page);
	await expect(page.locator('html')).toHaveClass(/dark/);
	const toggle = page.getByRole('button', { name: 'Dark mode' });
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await toggle.click();
	await expect(page.locator('html')).toHaveClass(/light/);
	await page.reload();
	await waitReady(page);
	await expect(page.locator('html')).toHaveClass(/light/);
	await expect(page.locator('html')).not.toHaveClass(/dark/);
	await page.goto('/admin/users');
	await waitReady(page);
	await expect(page.locator('html')).toHaveClass(/light/);
	await shot(page, 'appearance-override-the-system');
	await page.getByRole('button', { name: 'Dark mode' }).click();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await page.reload();
	await waitReady(page);
	await expect(page.locator('html')).toHaveClass(/dark/);
	await ctx.close();
});

test('Toggle by keyboard', async ({ browser }) => {
	const ctx = await browser.newContext({ colorScheme: 'light' });
	const page = await ctx.newPage();
	await signIn(page, 'admin');
	await waitReady(page);
	const toggle = page.getByRole('button', { name: 'Dark mode' });
	await toggle.focus();
	await expect(toggle).toBeFocused();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await page.keyboard.press('Enter');
	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Space');
	await expect(page.locator('html')).toHaveClass(/light/);
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await page.keyboard.press('Space');
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await shot(page, 'appearance-toggle-by-keyboard');
	await ctx.close();
});

test('No scripts: pages stay legible using the system preference', async ({ browser }) => {
	for (const mode of ['dark', 'light'] as Mode[]) {
		const ctx = await browser.newContext({ colorScheme: mode, javaScriptEnabled: false });
		const p = await ctx.newPage();
		await p.goto('/signin');
		await expect(p.getByRole('heading', { name: 'Lehman Family LLC' })).toBeVisible();
		await expect(p.getByLabel('Email')).toBeVisible();
		await expect(p.getByRole('button', { name: 'Sign in' })).toBeVisible();
		// no script ran, so neither mode class was applied; CSS follows the system preference
		expect(await p.evaluate(() => document.documentElement.className)).not.toMatch(/dark|light/);
		const res = await measureContrast(p);
		console.log(`no-JS ${mode}: ${res.checked} text items measured, failures: ${JSON.stringify(res.failures)}`);
		expect(res.checked).toBeGreaterThan(3);
		expect(res.failures).toEqual([]);
		const cs = await p.evaluate(() => ({
			html: getComputedStyle(document.documentElement).backgroundColor,
			body: getComputedStyle(document.body).backgroundColor,
			text: getComputedStyle(document.body).color
		}));
		console.log(`no-JS ${mode}: html bg ${cs.html}, body bg ${cs.body}, text ${cs.text}`);
		await shot(p, `appearance-no-scripts-${mode}`);
		await ctx.close();
	}
	void QA_USER_EMAIL;
});
