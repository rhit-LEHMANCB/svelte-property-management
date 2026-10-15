import { test, expect, type Page } from '@playwright/test';
import { newSession, shot, slug } from './helpers';

const adminPages = ['/', '/admin', '/admin/properties', '/admin/users', '/admin/maintenance', '/profile'];
const tenantPages = ['/', '/payment', '/maintenance', '/profile', '/insurance'];

async function visit(page: Page, who: string, url: string) {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 150)}`);
	});
	const res = await page.goto(url);
	await page.waitForLoadState('networkidle');
	expect(res?.status(), `${who} ${url}`).toBeLessThan(400);
	// The users and maintenance lists show other people's contact details, so they are not screenshotted.
	if (!/users|maintenance/.test(url)) await shot(page, `regression-${who}-${slug(url) || 'home'}`);
	page.removeAllListeners('pageerror');
	page.removeAllListeners('console');
	return errors;
}

test.describe('Regression pass', () => {
	test('Admin top-level pages load', async ({ browser }) => {
		const page = await newSession(browser, 'admin');
		const all: string[] = [];
		for (const url of adminPages) all.push(...(await visit(page, 'admin', url)).map((e) => `${url} ${e}`));
		test.info().annotations.push({ type: 'console errors', description: all.join(' | ') || 'none' });
		console.log('ADMIN console errors:', all.join(' | ') || 'none');
	});

	test('Tenant top-level pages load', async ({ browser }) => {
		const page = await newSession(browser, 'tenant');
		const all: string[] = [];
		for (const url of tenantPages) all.push(...(await visit(page, 'tenant', url)).map((e) => `${url} ${e}`));
		test.info().annotations.push({ type: 'console errors', description: all.join(' | ') || 'none' });
		console.log('TENANT console errors:', all.join(' | ') || 'none');
	});

	test('Tenant cannot reach admin pages', async ({ browser }) => {
		const page = await newSession(browser, 'tenant');
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		// A tenant sees no property list: the page answers with an error or a redirect.
		await expect(page.getByRole('link', { name: 'Add Property' })).toHaveCount(0);
	});
});
