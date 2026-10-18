import { test, expect, type Page } from '@playwright/test';
import { BOOM, QA_PROPERTY, QA_PROPERTY_TITLE, box, firstLeaseHref, open, shot, signInAs } from './support';

test.use({ viewport: { width: 1280, height: 1300 } });
test.setTimeout(120_000);

test.describe('page-layout notices and forms', () => {
	test('Form error notice: wrong password shows an alert notice above the button, not under a field', async ({ page }) => {
		await page.goto('/signin');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Email').fill('qa-nobody@example.com');
		await page.getByLabel('Password').fill('definitely-wrong-1');
		await page.getByRole('button', { name: 'Sign in' }).click();
		const notice = page.getByText('Your email or password is incorrect.');
		await expect(notice).toBeVisible();
		const holder = page.locator('[role="alert"]', { hasText: 'Your email or password is incorrect.' });
		await expect(holder).toHaveCount(1);
		const nb = await box(holder);
		const bb = await box(page.getByRole('button', { name: 'Sign in' }));
		expect(nb.y + nb.height).toBeLessThanOrEqual(bb.y);
		// not under either field, no aria-invalid on them
		await expect(page.getByLabel('Email')).not.toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByLabel('Password')).not.toHaveAttribute('aria-invalid', 'true');
		const pad = await holder.evaluate((e) => getComputedStyle(e).padding);
		console.log('notice padding', pad);
		await shot(page, 'page-layout-form-error-notice-signin');
	});

	test('Form submits match / Row actions: button sizes and spacing', async ({ page }) => {
		const rows: Record<string, unknown> = {};
		const measure = async (name: string, path: string, label: string | RegExp) => {
			await open(page, path);
			const btn = page.getByRole('button', { name: label }).first();
			const b = await box(btn);
			const m = await page.evaluate(
				({ y }) => {
					const fields = [...document.querySelectorAll('main input:not([type=hidden]), main textarea, main select')]
						.map((e) => e.getBoundingClientRect())
						.filter((r) => r.height > 0 && r.bottom <= y + 1);
					const last = fields.sort((a, b) => b.bottom - a.bottom)[0];
					return last ? Math.round(y - last.bottom) : null;
				},
				{ y: b.y }
			);
			rows[name] = { height: Math.round(b.height), width: Math.round(b.width), fromLastField: m, cls: await btn.getAttribute('class') };
		};
		await signInAs(page, 'tenant');
		await measure('profile', '/profile', /^Save$/);
		await shot(page, 'page-layout-form-submits-match-profile');
		await measure('insurance', '/insurance', /^Save$/);
		await shot(page, 'page-layout-form-submits-match-insurance');
		await measure('maintenance', '/maintenance', /^Send request$/);
		await shot(page, 'page-layout-form-submits-match-maintenance');
		await page.context().clearCookies();
		await signInAs(page, 'admin');
		await measure('property-add', '/admin/properties/add', /^Save$/);
		await shot(page, 'page-layout-form-submits-match-property');
		await open(page, '/admin/properties');
		const rowBtns = await page.locator('main tbody tr').first().locator('button, a').evaluateAll((els) =>
			els.map((e) => ({ t: (e.textContent ?? '').trim() || e.getAttribute('aria-label') || e.getAttribute('title'), h: Math.round(e.getBoundingClientRect().height), cls: e.className.toString().slice(0, 100) }))
		);
		console.log('properties row actions', JSON.stringify(rowBtns));
		rows['row-close'] = { height: Math.min(...rowBtns.filter((r) => r.h > 0).map((r) => r.h)) };
		await shot(page, 'page-layout-row-actions-admin-properties');
		console.log(JSON.stringify(rows, null, 1));
		const heights = ['profile', 'insurance', 'maintenance', 'property-add'].map((k) => (rows[k] as any).height);
		const gaps = ['profile', 'insurance', 'maintenance', 'property-add'].map((k) => (rows[k] as any).fromLastField);
		expect.soft(new Set(heights).size, `submit heights ${heights}`).toBe(1);
		expect.soft(new Set(gaps).size, `submit gaps ${gaps}`).toBe(1);
		expect.soft((rows['row-close'] as any).height, 'row action smaller').toBeLessThan(heights[0]);
	});
});

async function crumbs(page: Page) {
	const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
	return {
		count: await nav.count(),
		items: await nav.locator('li').allInnerTexts(),
		links: await nav.locator('a').evaluateAll((as) => as.map((a) => `${a.textContent?.trim()} -> ${a.getAttribute('href')}`)),
		current: await nav.locator('[aria-current="page"]').count(),
		lastIsLink: await nav.locator('li').last().locator('a').count(),
		ordered: await nav.locator('ol').count()
	};
}

test.describe('page-layout breadcrumbs', () => {
	test('Edit lease: Properties > property > Edit lease with working links', async ({ page }) => {
		await signInAs(page, 'admin');
		const href = await firstLeaseHref(page, BOOM);
		expect(href, 'a lease on boom').toBeTruthy();
		await open(page, href!);
		const c = await crumbs(page);
		console.log('edit lease crumbs', JSON.stringify(c));
		expect(c.count).toBe(1);
		expect(c.items.map((s) => s.trim())).toEqual(['Properties', 'boom', 'Edit lease']);
		expect(c.links.some((l) => l.endsWith('-> /admin/properties'))).toBe(true);
		expect(c.links.some((l) => l.includes(`-> /admin/properties/${BOOM}/edit`))).toBe(true);
		expect(c.lastIsLink).toBe(0);
		await shot(page, 'page-layout-edit-lease-breadcrumbs');
	});

	test('Other nested pages show breadcrumbs: New property, Property, New lease, Payment success', async ({ page }) => {
		await signInAs(page, 'admin');
		const got: Record<string, string[]> = {};
		for (const [k, p] of [
			['new-property', '/admin/properties/add'],
			['property', `/admin/properties/${BOOM}/edit`],
			['new-lease', `/admin/properties/${BOOM}/leases/new`]
		]) {
			await open(page, p);
			const c = await crumbs(page);
			got[k] = c.items.map((s) => s.trim());
			expect(c.count, k).toBe(1);
			expect(c.lastIsLink, k).toBe(0);
			await shot(page, `page-layout-nested-breadcrumbs-${k}`);
		}
		console.log(JSON.stringify(got));
		expect(got['new-property']).toEqual(['Properties', 'New property']);
		expect(got['property']).toEqual(['Properties', 'boom']);
		expect(got['new-lease']).toEqual(['Properties', 'boom', 'New lease']);
		await page.context().clearCookies();
		await signInAs(page, 'tenant');
		await open(page, '/payment/success');
		const c = await crumbs(page);
		console.log('success', JSON.stringify(c));
		expect(c.items.map((s) => s.trim())).toEqual(['Payment', 'Success']);
		expect(c.links.some((l) => l.endsWith('-> /payment'))).toBe(true);
		await shot(page, 'page-layout-nested-breadcrumbs-payment-success');
	});

	test('Top-level page: no breadcrumbs', async ({ page }) => {
		await signInAs(page, 'tenant');
		for (const p of ['/profile', '/payment', '/maintenance', '/insurance', '/']) {
			await open(page, p);
			expect((await crumbs(page)).count, p).toBe(0);
		}
		await shot(page, 'page-layout-top-level-no-breadcrumbs-tenant-payment');
		await page.context().clearCookies();
		await signInAs(page, 'admin');
		for (const p of ['/admin', '/admin/users', '/admin/properties', '/admin/maintenance', '/profile']) {
			await open(page, p);
			expect((await crumbs(page)).count, p).toBe(0);
		}
		await shot(page, 'page-layout-top-level-no-breadcrumbs-admin-properties');
	});

	test('Long title on a phone: crumbs stay on screen, long crumb ellipsized', async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 800 });
		await signInAs(page, 'admin');
		for (const [k, p] of [
			['property', `/admin/properties/${QA_PROPERTY}/edit`],
			['new-lease', `/admin/properties/${QA_PROPERTY}/leases/new`]
		]) {
			await open(page, p);
			const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
			const nb = await box(nav);
			const info = await page.evaluate(() => {
				const nav = document.querySelector('nav[aria-label="Breadcrumb"]')!;
				const lis = [...nav.querySelectorAll('li')];
				return {
					docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
					mainOverflow: document.querySelector('main')!.scrollWidth - document.querySelector('main')!.clientWidth,
					rights: lis.map((l) => Math.round(l.getBoundingClientRect().right)),
					ellipsis: lis.some((l) => [l, ...l.querySelectorAll('*')].some((e) => { const cs = getComputedStyle(e); return cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth; }))
				};
			});
			console.log(k, JSON.stringify(info), nb.x + nb.width);
			expect(nb.x + nb.width, k).toBeLessThanOrEqual(360);
			expect(info.docOverflow, k).toBe(0);
			expect(info.mainOverflow, k).toBe(0);
			info.rights.forEach((r) => expect(r, k).toBeLessThanOrEqual(360));
			expect(info.ellipsis, `${k} ellipsis`).toBe(true);
			await shot(page, `page-layout-long-title-phone-${k}`);
		}
		expect(QA_PROPERTY_TITLE.length).toBe(60);
	});
});
