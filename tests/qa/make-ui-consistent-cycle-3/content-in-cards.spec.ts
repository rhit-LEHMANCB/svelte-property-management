import { test, expect, type Page } from '@playwright/test';
import { BOOM, QA_PROPERTY, firstLeaseHref, open, shot, signInAs } from './support';

test.use({ viewport: { width: 1280, height: 1300 } });
test.setTimeout(240_000);

/** Headings (below h1), paragraphs, lists and tables that are not inside a card or notice. */
async function looseContent(page: Page) {
	return page.evaluate(() => {
		const main = document.querySelector('main')!;
		const boxed = (el: Element) => {
			for (let n: Element | null = el; n && n !== main; n = n.parentElement) {
				const cs = getComputedStyle(n);
				if (
					cs.boxShadow !== 'none' ||
					parseFloat(cs.borderTopWidth) > 0 ||
					parseFloat(cs.borderLeftWidth) > 0 ||
					cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
					n.getAttribute('role') === 'status' ||
					n.getAttribute('role') === 'alert'
				)
					return true;
			}
			return false;
		};
		const firstBoxedTop = Math.min(
			...[...main.querySelectorAll('div,section,article,form')].filter((e) => e.getBoundingClientRect().width > 250 && boxed(e) && !e.closest('nav')).map((e) => e.getBoundingClientRect().top + window.scrollY),
			Infinity
		);
		const loose: string[] = [];
		for (const el of main.querySelectorAll('h1,h2,h3,h4,h5,h6,p,ul,ol,table,li')) {
			if (el.closest('nav')) continue;
			if (el.tagName === 'H1') continue;
			const r = el.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) continue;
			if (boxed(el)) continue;
			// the one-line subtitle belongs to the header: it sits above the first card
			if (el.tagName === 'P' && r.top + window.scrollY < firstBoxedTop) continue;
			loose.push(`${el.tagName.toLowerCase()}: ${(el.textContent ?? '').trim().slice(0, 50)}`);
		}
		return loose;
	});
}

test('Every signed-in page: nothing sits loose on the background below the header', async ({ page }) => {
	const out: Record<string, string[]> = {};
	await signInAs(page, 'tenant');
	for (const p of ['/', '/maintenance', '/payment', '/payment/success', '/profile', '/insurance']) {
		await open(page, p);
		out['tenant ' + p] = await looseContent(page);
	}
	await open(page, '/maintenance');
	await page.getByRole('tab', { name: /^Closed/ }).click();
	out['tenant /maintenance (Closed tab)'] = await looseContent(page);
	await shot(page, 'page-layout-every-signed-in-page-tenant-maintenance');
	await page.context().clearCookies();
	await signInAs(page, 'admin');
	const lease = await firstLeaseHref(page, BOOM);
	for (const p of [
		'/admin',
		'/admin/users',
		'/admin/properties',
		'/admin/maintenance',
		'/admin/properties/add',
		`/admin/properties/${QA_PROPERTY}/edit`,
		`/admin/properties/${QA_PROPERTY}/leases/new`,
		lease!,
		'/profile'
	]) {
		await open(page, p);
		out['admin ' + p] = await looseContent(page);
	}
	await open(page, `/admin/properties/${BOOM}/edit`);
	for (const tab of ['Photos', 'Leases']) {
		await page.getByRole('tab', { name: tab }).or(page.getByRole('button', { name: tab })).first().click();
		await page.waitForTimeout(600);
		out[`admin property tab ${tab}`] = await looseContent(page);
		await shot(page, `page-layout-every-signed-in-page-admin-property-${tab.toLowerCase()}`);
	}
	console.log(JSON.stringify(out, null, 1));
	for (const [k, v] of Object.entries(out)) expect.soft(v, k).toEqual([]);
});

test('Maintenance lists: tenant lists are inside a titled card', async ({ page }) => {
	await signInAs(page, 'tenant');
	await open(page, '/maintenance');
	const info = await page.evaluate(() => {
		const h = [...document.querySelectorAll('main h2')].find((e) => /Your requests/.test(e.textContent ?? ''))!;
		let card: HTMLElement = h.parentElement!;
		while (card.parentElement && card.tagName !== 'MAIN' && getComputedStyle(card).boxShadow === 'none' && parseFloat(getComputedStyle(card).borderTopWidth) === 0 && getComputedStyle(card).backgroundColor === 'rgba(0, 0, 0, 0)') card = card.parentElement;
		return { hasTable: card.querySelector('table') !== null || card.querySelector('[role=tabpanel]') !== null, tabs: card.querySelectorAll('[role=tab]').length };
	});
	console.log(JSON.stringify(info));
	expect(info.tabs).toBe(2);
	expect(info.hasTable).toBe(true);
	await shot(page, 'page-layout-maintenance-lists-tenant');
});
