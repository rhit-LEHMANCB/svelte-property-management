import { test, expect } from '@playwright/test';
import { ready, shot, newSession, saveState } from './helpers';

test.setTimeout(300_000);

/** Opens the edit page and the Leases tab of every property on the admin list (existing and qa-), recording HTTP status. */
test('property edit page and Leases tab load for every listed property', async ({ browser }) => {
	const { ctx, page } = await newSession(browser, 'admin');
	await page.goto('/admin/properties');
	await ready(page);
	const hrefs = new Set<string>();
	for (let guard = 0; guard < 20; guard++) {
		const links = await page
			.locator('a[href^="/admin/properties/"][href$="/edit"]')
			.evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
		links.forEach((h) => hrefs.add(h));
		const next = page.getByRole('button', { name: /next/i }).or(page.getByRole('link', { name: /next/i }));
		if ((await next.count()) === 0 || !(await next.first().isEnabled())) break;
		await next.first().click();
		await page.waitForTimeout(500);
	}
	console.log('PROPERTY COUNT on list:', hrefs.size);
	await shot(page, 'regression-admin-properties-list');
	const failures: string[] = [];
	const rows: string[] = [];
	let i = 0;
	for (const href of hrefs) {
		i++;
		const id = href.split('/')[3];
		const errors: string[] = [];
		const onErr = (m: any) => m.type() === 'error' && errors.push(m.text().slice(0, 100));
		page.on('console', onErr);
		const edit = await page.goto(href);
		await ready(page);
		const editStatus = edit?.status() ?? 0;
		const title = await page.getByTitle('Title', { exact: true }).inputValue().catch(() => '?');
		const tabRes = await page.goto(`${href}?tab=leases`);
		await ready(page);
		const tabStatus = tabRes?.status() ?? 0;
		// Also click the tab from the plain edit page
		await page.goto(href);
		await ready(page);
		await page.getByRole('tab', { name: 'Leases' }).click();
		await page.waitForTimeout(800);
		const list = page.getByRole('list', { name: 'Leases' }).locator(':scope > li');
		const n = await list.count();
		const empty = await page.getByText('No leases', { exact: true }).count();
		const create = await page.getByRole('link', { name: /lease/i }).count();
		page.off('console', onErr);
		const isQa = title.startsWith('qa-');
		rows.push(
			`#${i} ${isQa ? title : '<existing>'} id=${id} edit=${editStatus} leasesTab=${tabStatus} leases=${n} noLeasesMsg=${empty} createLink=${create} consoleErrors=${errors.length}`
		);
		if (editStatus >= 400 || tabStatus >= 400) failures.push(rows[rows.length - 1]);
		if (n === 0 && empty === 0) failures.push(`no lease list or empty message: #${i}`);
		await shot(page, `regression-property-leases-tab-${i}`);
	}
	console.log(rows.join('\n'));
	saveState({ propertyCount: hrefs.size });
	expect(failures, failures.join('\n')).toEqual([]);
	await ctx.close();
});
