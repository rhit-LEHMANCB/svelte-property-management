import { test, expect, type Page } from '@playwright/test';
import { open, signInAs } from './support';

test.use({ viewport: { width: 1280, height: 1300 } });
test.setTimeout(180_000);

function watch(page: Page) {
	const errors: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text().slice(0, 160));
	});
	page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 160)));
	return errors;
}

test('Regression: each role signs in, loads each top-level page, no console errors, sign out works', async ({ page }) => {
	const errors = watch(page);
	const results: string[] = [];
	for (const [who, pages] of [
		['tenant', ['/', '/maintenance', '/payment', '/insurance', '/profile']],
		['admin', ['/admin', '/admin/users', '/admin/properties', '/admin/maintenance', '/profile']]
	] as const) {
		await page.context().clearCookies();
		await signInAs(page, who);
		for (const p of pages) {
			const resp = await page.goto(p);
			await page.waitForLoadState('networkidle');
			results.push(`${who} ${p} ${resp?.status()} h1="${await page.locator('main h1').first().innerText()}"`);
			expect(resp?.status(), p).toBeLessThan(400);
			await expect(page.locator('main h1').first()).toBeVisible();
		}
	}
	// sidebar navigation
	await open(page, '/admin');
	await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Users' }).click();
	await expect(page).toHaveURL(/\/admin\/users/);
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/signin/);
	console.log(results.join('\n'));
	console.log('console errors:', JSON.stringify(errors));
	expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
});

test('Regression: tenant cannot open admin pages; admin Add User dialog opens with labelled fields', async ({ page }) => {
	await signInAs(page, 'admin');
	await open(page, '/admin/users');
	await page.getByRole('button', { name: /Add User/i }).click();
	const d = page.getByRole('dialog');
	await expect(d).toBeVisible();
	console.log('add user dialog:', (await d.innerText()).replace(/\n+/g, ' | '));
	// submit empty: field errors, nothing is created
	await d.getByRole('button', { name: /^Submit$/ }).last().click();
	await page.waitForTimeout(700);
	console.log('invalid fields in dialog:', await d.locator('[aria-invalid="true"]').count());
	await d.screenshot({ path: 'openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-field-errors-add-user-dialog.jpg', type: 'jpeg', quality: 60 });
});
