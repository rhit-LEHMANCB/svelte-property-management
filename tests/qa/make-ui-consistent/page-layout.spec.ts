import { test } from '@playwright/test';
import { QA_PROPERTY_TITLE, box, expect, go, noHScroll, padding, shot, signInAs } from './support';
import { state } from './state';

const BOGUS_RESET = '/reset?mode=resetPassword&oobCode=qa-not-a-real-code';
const BOGUS_LEASE_PROPERTY = 'wrIhk0hPRVK1hDCaId8y';
const BOGUS_LEASE = 'migrated-wrIhk0hPRVK1hDCaId8y';

const adminPages = [
	'/',
	'/admin',
	'/admin/users',
	'/admin/properties',
	'/admin/maintenance',
	'/profile',
	'/insurance',
	'/maintenance',
	'/payment'
];
const tenantPages = ['/', '/payment', '/maintenance', '/insurance', '/profile'];
const slug = (u: string) => (u === '/' ? 'home' : u.replace(/^\//, '').replace(/\//g, '-'));

test.describe('page-layout: width', () => {
	test.use({ viewport: { width: 1600, height: 900 } });
	for (const who of ['admin', 'tenant'] as const) {
		test(`Wide screen: every ${who} page is at most 1024px wide and centered`, async ({ page }) => {
			await signInAs(page, who);
			const rows: string[] = [];
			for (const url of who === 'admin' ? adminPages : tenantPages) {
				await go(page, url);
				const body = page.locator('[data-page-body]').first();
				if (!(await body.count())) {
					rows.push(`${url}: NO page body (landed ${new URL(page.url()).pathname})`);
					continue;
				}
				const b = await box(body);
				const parent = await box(body.locator('xpath=..'));
				const leftGap = b.x - parent.x;
				const rightGap = parent.x + parent.width - (b.x + b.width);
				rows.push(
					`${url}: w=${Math.round(b.width)} left=${Math.round(leftGap)} right=${Math.round(rightGap)}`
				);
				expect.soft(b.width, `${url} width`).toBeLessThanOrEqual(1024.5);
				expect.soft(Math.abs(leftGap - rightGap), `${url} centering`).toBeLessThanOrEqual(2);
				if (url === '/admin/users' || url === '/profile' || url === '/')
					await shot(page, `page-layout-wide-screen-${who}-${slug(url)}`);
			}
			console.log(`WIDE ${who}\n` + rows.join('\n'));
		});
	}

	test('List and form pages match: Users and Profile share left edge and max width', async ({
		page
	}) => {
		await signInAs(page, 'admin');
		await go(page, '/admin/users');
		const users = await box(page.locator('[data-page-body]').first());
		await shot(page, 'page-layout-list-and-form-pages-match-users');
		await go(page, '/profile');
		const profile = await box(page.locator('[data-page-body]').first());
		await shot(page, 'page-layout-list-and-form-pages-match-profile');
		console.log('USERS-vs-PROFILE', JSON.stringify({ users, profile }));
		expect(users.x).toBeCloseTo(profile.x, 0);
		expect(users.width).toBeCloseTo(profile.width, 0);
	});
});

test.describe('page-layout: phone width', () => {
	test.use({ viewport: { width: 360, height: 740 } });
	for (const scheme of ['light', 'dark'] as const) {
		for (const who of ['admin', 'tenant'] as const) {
			test(`Phone width: no horizontal scroll on ${who} pages in ${scheme} mode`, async ({
				page
			}) => {
				await page.emulateMedia({ colorScheme: scheme });
				await signInAs(page, who);
				const urls = [...(who === 'admin' ? adminPages : tenantPages)];
				if (who === 'admin')
					urls.push(
						'/admin/properties/add',
						`/admin/properties/${BOGUS_LEASE_PROPERTY}/edit`,
						`/admin/properties/${BOGUS_LEASE_PROPERTY}/edit?tab=leases`,
						`/admin/properties/${BOGUS_LEASE_PROPERTY}/leases/new`,
						`/admin/properties/${BOGUS_LEASE_PROPERTY}/leases/${BOGUS_LEASE}`
					);
				else urls.push('/payment/success');
				const out: string[] = [];
				for (const url of urls) {
					await go(page, url);
					const over = await noHScroll(page);
					out.push(`${url}: overflow=${over}`);
					expect.soft(over, `${url} overflows by ${over}px`).toBeLessThanOrEqual(1);
					if (url === '/' || url === '/profile')
						await shot(page, `page-layout-phone-width-${who}-${scheme}-${slug(url)}`);
				}
				console.log(`PHONE ${who} ${scheme}\n` + out.join('\n'));
			});
		}
	}
	test('Phone width: signed-out pages do not scroll horizontally', async ({ page }) => {
		for (const url of ['/signin', '/forgot', BOGUS_RESET]) {
			await go(page, url);
			expect.soft(await noHScroll(page), url).toBeLessThanOrEqual(1);
		}
	});
});

test.describe('page-layout: cards', () => {
	test.use({ viewport: { width: 1280, height: 900 } });
	test('Two pages cards: Profile Contact Info and Maintenance Add Request share padding, heading first', async ({
		page
	}) => {
		await signInAs(page, 'tenant');
		await go(page, '/profile');
		const contact = page
			.locator('[data-card]', { has: page.getByRole('heading', { name: 'Contact Info' }) })
			.first();
		const p1 = await padding(contact);
		const first1 = await contact.evaluate((el) =>
			el.firstElementChild?.querySelector('h1,h2,h3,h4')
				? el.firstElementChild.tagName + ':' + el.firstElementChild.textContent?.trim()
				: 'x:' + el.firstElementChild?.tagName
		);
		await shot(page, 'page-layout-two-pages-cards-profile', { target: contact });
		await go(page, '/maintenance');
		const add = page
			.locator('[data-card]', {
				has: page.getByRole('heading', { name: 'Add Maintenance Request' })
			})
			.first();
		const p2 = await padding(add);
		const first2 = await add.evaluate((el) =>
			el.firstElementChild?.querySelector('h1,h2,h3,h4')
				? el.firstElementChild.tagName + ':' + el.firstElementChild.textContent?.trim()
				: 'x:' + el.firstElementChild?.tagName
		);
		await shot(page, 'page-layout-two-pages-cards-maintenance', { target: add });
		console.log('CARDS', p1, '|', p2, '|', first1, '|', first2);
		expect(p1).toBe(p2);
		expect(p1).toBe('24px 24px 24px 24px');
		expect(first1).toContain('Contact Info');
		expect(first2).toContain('Add Maintenance Request');
		// Wider than the sm breakpoint here; at 360px the padding is 16px.
	});

	test('Two pages cards: 16px padding below the small breakpoint', async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 800 });
		await signInAs(page, 'tenant');
		await go(page, '/profile');
		const p = await padding(page.locator('[data-card]').first());
		console.log('CARD360', p);
		expect(p).toBe('16px 16px 16px 16px');
	});

	test('Dashboard and admin home: tenant lease card and admin tile share padding', async ({
		page
	}) => {
		await signInAs(page, 'tenant');
		await go(page, '/');
		const lease = page.locator('[data-card]').first();
		const p1 = await padding(lease);
		await shot(page, 'page-layout-dashboard-and-admin-home-tenant-lease-card', { target: lease });
		await page.context().clearCookies();
		await signInAs(page, 'admin');
		await go(page, '/admin');
		const tile = page.locator('[data-card]').first();
		const p2 = await padding(tile);
		await shot(page, 'page-layout-dashboard-and-admin-home-admin-tile', { target: tile });
		console.log('TILES', p1, '|', p2);
		expect(p1).toBe(p2);
	});
});

test.describe('page-layout: auth cards', () => {
	test.use({ viewport: { width: 1280, height: 900 } });
	test('Compare auth pages: Sign in, Forgot and Reset cards match', async ({ page }) => {
		const metrics: Record<string, unknown> = {};
		for (const [name, url] of [
			['signin', '/signin'],
			['forgot', '/forgot'],
			['reset', BOGUS_RESET]
		] as const) {
			await go(page, url);
			const card = page.locator('[data-auth-card]');
			const html = await card.evaluate((el) => el.outerHTML.slice(0, 200));
			const b = await box(card);
			const s = await card.evaluate((el) => {
				const c = getComputedStyle(el);
				return { padding: c.padding, shadow: c.boxShadow };
			});
			const fields = page.locator('[data-auth-card] [data-field]');
			const fieldBoxes = [];
			for (let i = 0; i < (await fields.count()); i++) fieldBoxes.push(await box(fields.nth(i)));
			const gaps = fieldBoxes
				.slice(1)
				.map((f, i) => Math.round(f.y - (fieldBoxes[i].y + fieldBoxes[i].height)));
			const submit = card.getByRole('button', { name: /Sign in|Send reset link|Change Password/ });
			const sb = await box(submit);
			const last = fieldBoxes[fieldBoxes.length - 1];
			metrics[name] = {
				cardW: Math.round(b.width),
				...s,
				gaps,
				submitW: Math.round(sb.width),
				submitBelowLastField: Math.round(sb.y - (last.y + last.height)),
				html
			};
			await shot(page, `page-layout-compare-auth-pages-${name}`);
		}
		console.log('AUTH', JSON.stringify(metrics, null, 1));
		const m = Object.values(metrics) as any[];
		for (const k of ['cardW', 'padding', 'shadow', 'submitBelowLastField'] as const) {
			expect.soft(m[1][k], `forgot ${k}`).toEqual(m[0][k]);
			expect.soft(m[2][k], `reset ${k}`).toEqual(m[0][k]);
		}
	});
});

test.describe('page-layout: notices', () => {
	test.use({ viewport: { width: 1280, height: 900 } });
	test('Warning notice: shared padding and role status (user with no property on Maintenance)', async ({
		page
	}) => {
		// The QA tenant has a lease; the QA admin has none, so Maintenance shows the "no property" notice.
		await signInAs(page, 'admin');
		await go(page, '/maintenance');
		const n = page.locator('[data-notice="warning"]');
		await expect(n).toBeVisible();
		console.log('NOTICE-WARN', await padding(n), await n.getAttribute('role'));
		expect(await padding(n)).toBe('16px 16px 16px 16px');
		await expect(n).toHaveAttribute('role', 'status');
		await shot(page, 'page-layout-warning-notice');
	});

	test('Warning that stops a save: overlap warning has notice padding and role alert', async ({
		page
	}) => {
		await signInAs(page, 'admin');
		await go(page, `/admin/properties/${BOGUS_LEASE_PROPERTY}/edit?tab=leases`);
		await go(page, `/admin/properties/${BOGUS_LEASE_PROPERTY}/leases/${BOGUS_LEASE}`);
		const start = await page.getByLabel('Start date').inputValue();
		const end = await page.getByLabel('End date').inputValue();
		console.log('EXISTING-LEASE-DATES', start, end || 'month-to-month');
		await go(page, `/admin/properties/${BOGUS_LEASE_PROPERTY}/leases/new`);
		await page.getByLabel('Monthly rent').fill('1');
		await page.getByLabel('Start date').fill(start);
		if (end) await page.getByLabel('End date').fill(end);
		await page.getByLabel('Tenant email 1', { exact: true }).fill('qa-overlap-probe@example.com');
		await page.getByRole('button', { name: 'Save lease' }).click();
		const n = page.locator('[data-notice="warning"]');
		await expect(n).toBeVisible({ timeout: 20_000 });
		console.log(
			'NOTICE-OVERLAP',
			await padding(n),
			await n.getAttribute('role'),
			page.url().replace(/.*\.app/, '')
		);
		expect(await padding(n)).toBe('16px 16px 16px 16px');
		await expect(n).toHaveAttribute('role', 'alert');
		await shot(page, 'page-layout-warning-that-stops-a-save');
		// Do NOT press "Save anyway": nothing is saved.
	});

	test('Form error notice: wrong password shows an alert notice above the submit button', async ({
		page
	}) => {
		await go(page, '/signin');
		await page.getByLabel('Email').fill('qa-nobody@example.com');
		await page.getByLabel('Password').fill('not-the-password');
		await page.getByRole('button', { name: 'Sign in' }).click();
		const n = page.locator('[data-notice="error"]');
		await expect(n).toBeVisible();
		await expect(n).toHaveAttribute('role', 'alert');
		const nb = await box(n);
		const sb = await box(page.getByRole('button', { name: 'Sign in' }));
		expect(nb.y + nb.height).toBeLessThanOrEqual(sb.y);
		expect(await padding(n)).toBe('16px 16px 16px 16px');
		await shot(page, 'page-layout-form-error-notice');
	});
});

test.describe('page-layout: form actions', () => {
	test.use({ viewport: { width: 1280, height: 900 } });
	test('Form submits match: Profile, Insurance, Maintenance and property forms', async ({
		page
	}) => {
		const rows: Record<string, unknown> = {};
		const measure = async (
			name: string,
			form: ReturnType<typeof page.locator>,
			submitName: string
		) => {
			const actions = form.locator('[data-form-actions]').last();
			const btn = actions.getByRole('button', { name: submitName, exact: true });
			const bb = await box(btn);
			const cls = await btn.getAttribute('class');
			const lastField = form.locator('[data-field]').last();
			const lf = await box(lastField);
			const ab = await box(actions);
			const style = await actions.evaluate((el) => {
				const c = getComputedStyle(el);
				return { pt: c.paddingTop, gap: c.gap };
			});
			rows[name] = {
				height: Math.round(bb.height),
				small: /btn-sm/.test(cls ?? ''),
				gapFromField: Math.round(bb.y - (lf.y + lf.height)),
				actionsRowTop: Math.round(ab.y - (lf.y + lf.height)),
				...style
			};
		};
		await signInAs(page, 'tenant');
		await go(page, '/profile');
		await measure('profile', page.locator('form[action="?/contact"]'), 'Save');
		await shot(page, 'page-layout-form-submits-profile', {
			target: page.locator('form[action="?/contact"]')
		});
		await go(page, '/insurance');
		await measure('insurance', page.locator('form').first(), 'Save');
		await shot(page, 'page-layout-form-submits-insurance', {
			target: page.locator('form').first()
		});
		await go(page, '/maintenance');
		await measure('maintenance', page.locator('[data-card] form').first(), 'Add');
		await shot(page, 'page-layout-form-submits-maintenance', {
			target: page.locator('[data-card] form').first()
		});
		await page.context().clearCookies();
		await signInAs(page, 'admin');
		await go(page, '/admin/properties/add');
		await measure('property', page.locator('form[action="?/basicInfo"]'), 'Save');
		await shot(page, 'page-layout-form-submits-property', {
			target: page.locator('form[action="?/basicInfo"]')
		});
		console.log('FORMS', JSON.stringify(rows));
		const v = Object.values(rows) as any[];
		for (const r of v) {
			expect.soft(r.small).toBe(false);
			expect.soft(r.height).toBe(v[0].height);
			expect.soft(r.gapFromField).toBe(v[0].gapFromField);
			expect.soft(r.gap).toBe(v[0].gap);
		}
	});

	test('Row actions: list-row buttons use the small size (maintenance Close, Users and Properties row menus)', async ({
		page
	}) => {
		// A qa- request makes the admin list show its row action; the request is deleted in cleanup.
		await signInAs(page, 'tenant');
		await go(page, '/maintenance');
		const subject = 'qa-ui-row-action';
		const form = page.locator('[data-card] form').first();
		await form.getByLabel('Subject').fill(subject);
		await form.getByLabel('Description').fill('qa- temporary request for UI QA');
		await form.getByRole('button', { name: 'Add' }).click();
		await page.waitForLoadState('networkidle');
		await page.context().clearCookies();
		await signInAs(page, 'admin');
		await go(page, '/admin/maintenance');
		const close = page.getByRole('button', { name: `Close request ${subject}` });
		await expect(close).toBeVisible();
		const cls = await close.getAttribute('class');
		const h = (await box(close)).height;
		console.log('ROW-CLOSE', cls, h);
		expect(cls).toContain('btn-sm');
		await shot(page, 'page-layout-row-actions-maintenance', {
			target: page.locator('section', { has: close })
		});
		await go(page, '/admin/users');
		const rowMenus = page.locator('table tbody button[aria-label]');
		const um = await rowMenus.evaluateAll((els) => els.map((e) => e.className));
		console.log('ROW-USERS', JSON.stringify(um));
		for (const c of um) expect.soft(c).toContain('btn-icon-sm');
		await shot(page, 'page-layout-row-actions-users');
		await go(page, '/admin/properties');
		const pm = await page
			.locator('table tbody button[aria-label]')
			.evaluateAll((els) => els.map((e) => e.className));
		console.log('ROW-PROPS', JSON.stringify(pm));
		for (const c of pm) expect.soft(c).toContain('btn-icon-sm');
	});
});

test.describe('page-layout: breadcrumbs', () => {
	test.use({ viewport: { width: 1280, height: 900 } });
	test('Edit lease: Properties > boom > Edit lease with working links', async ({ page }) => {
		await signInAs(page, 'admin');
		await go(page, `/admin/properties/${BOGUS_LEASE_PROPERTY}/leases/${BOGUS_LEASE}`);
		const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
		await expect(nav).toBeVisible();
		const items = await nav.locator('li').allInnerTexts();
		console.log('CRUMBS', JSON.stringify(items.map((s) => s.trim())));
		expect(items.map((s) => s.trim())).toEqual(['Properties', 'boom', 'Edit lease']);
		await expect(nav.getByRole('link', { name: 'Properties' })).toHaveAttribute(
			'href',
			'/admin/properties'
		);
		await expect(nav.getByRole('link', { name: 'boom' })).toHaveAttribute(
			'href',
			new RegExp(`/admin/properties/${BOGUS_LEASE_PROPERTY}/edit`)
		);
		await expect(nav.locator('li').last().locator('a')).toHaveCount(0);
		await shot(page, 'page-layout-edit-lease-breadcrumbs');
		await nav.getByRole('link', { name: 'Properties' }).click();
		await expect(page).toHaveURL(/\/admin\/properties$/);
	});

	test('Other nested pages: New property, Property edit, New lease, Payment success', async ({
		page
	}) => {
		await signInAs(page, 'admin');
		const expectCrumbs = async (url: string, crumbs: string[], slugName: string) => {
			await go(page, url);
			const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
			await expect(nav, url).toBeVisible();
			expect
				.soft(
					(await nav.locator('li').allInnerTexts()).map((s) => s.trim()),
					url
				)
				.toEqual(crumbs);
			await shot(page, `page-layout-nested-${slugName}-breadcrumbs`);
		};
		await expectCrumbs('/admin/properties/add', ['Properties', 'New property'], 'new-property');
		await expectCrumbs(
			`/admin/properties/${BOGUS_LEASE_PROPERTY}/edit`,
			['Properties', 'boom'],
			'property-edit'
		);
		await expectCrumbs(
			`/admin/properties/${BOGUS_LEASE_PROPERTY}/leases/new`,
			['Properties', 'boom', 'New lease'],
			'new-lease'
		);
		await page.context().clearCookies();
		await signInAs(page, 'tenant');
		await expectCrumbs('/payment/success', ['Payment', 'Success'], 'payment-success');
		const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
		await expect(nav.getByRole('link', { name: 'Payment' })).toHaveAttribute('href', '/payment');
	});

	test('Top-level page: no breadcrumbs', async ({ page }) => {
		await signInAs(page, 'tenant');
		for (const u of ['/profile', '/payment', '/maintenance', '/insurance', '/']) {
			await go(page, u);
			expect.soft(await page.getByRole('navigation', { name: 'Breadcrumb' }).count(), u).toBe(0);
		}
		await shot(page, 'page-layout-top-level-tenant-dashboard');
		await page.context().clearCookies();
		await signInAs(page, 'admin');
		for (const u of ['/admin', '/admin/users', '/admin/properties', '/admin/maintenance']) {
			await go(page, u);
			expect.soft(await page.getByRole('navigation', { name: 'Breadcrumb' }).count(), u).toBe(0);
		}
		await shot(page, 'page-layout-top-level-admin-properties');
	});
});

test.describe('page-layout: long breadcrumb on a phone', () => {
	test.use({ viewport: { width: 360, height: 740 } });
	test('Long title on a phone: crumbs stay on screen, long crumb ellipsized', async ({ page }) => {
		await signInAs(page, 'admin');
		const id = state().propertyId;
		for (const url of [`/admin/properties/${id}/edit`, `/admin/properties/${id}/leases/new`]) {
			await go(page, url);
			const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
			await expect(nav).toBeVisible();
			expect(QA_PROPERTY_TITLE.length).toBe(60);
			const nb = await box(nav);
			expect.soft(nb.x + nb.width, url).toBeLessThanOrEqual(360.5);
			expect.soft(await noHScroll(page), url).toBeLessThanOrEqual(1);
			const clipped = await nav
				.locator('.truncate')
				.evaluateAll((els) =>
					els.map((e) => ({
						clip: e.scrollWidth > e.clientWidth,
						ov: getComputedStyle(e).textOverflow
					}))
				);
			console.log(
				'LONGCRUMB',
				url.replace(id, '<id>'),
				JSON.stringify(clipped),
				JSON.stringify(nb)
			);
			expect
				.soft(
					clipped.some((c) => c.clip && c.ov === 'ellipsis'),
					`${url} ellipsis`
				)
				.toBe(true);
			await shot(
				page,
				`page-layout-long-title-on-a-phone-${url.endsWith('new') ? 'new-lease' : 'property-edit'}`
			);
		}
	});
});
