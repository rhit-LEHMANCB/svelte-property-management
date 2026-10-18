import { test, expect, type Page } from '@playwright/test';
import { box, open, shot, signInAs } from './support';

const TENANT_PAGES = ['/', '/maintenance', '/payment', '/payment/success', '/profile', '/insurance'];
const ADMIN_PAGES = [
	'/admin',
	'/admin/users',
	'/admin/properties',
	'/admin/maintenance',
	'/admin/properties/add',
	'/profile'
];

/** Left/right extent of everything visible inside main, and main's own box. */
async function extent(page: Page) {
	return page.evaluate(() => {
		const main = document.querySelector('main')!;
		const m = main.getBoundingClientRect();
		let l = Infinity,
			r = -Infinity;
		for (const el of main.querySelectorAll('*')) {
			const b = el.getBoundingClientRect();
			if (b.width === 0 || b.height === 0) continue;
			const cs = getComputedStyle(el);
			const decorated =
				cs.boxShadow !== 'none' ||
				parseFloat(cs.borderTopWidth) > 0 ||
				cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
			if (!decorated) continue;
			l = Math.min(l, b.left);
			r = Math.max(r, b.right);
		}
		return { mainLeft: m.left, mainRight: m.right, left: l, right: r, width: r - l };
	});
}
const overflow = (page: Page) =>
	page.evaluate(() =>
		Math.max(
			...[document.scrollingElement, document.querySelector('main')]
				.filter((e): e is Element => !!e)
				.map((e) => e.scrollWidth - e.clientWidth)
		)
	);

test.use({ viewport: { width: 1280, height: 1300 } });
test.describe('page-layout width', () => {
	test.setTimeout(240_000);
	test('Wide screen: every signed-in page <= 1024px and centered', async ({ page }) => {
		await page.setViewportSize({ width: 1600, height: 900 });
		const res: string[] = [];
		for (const [who, pages] of [
			['tenant', TENANT_PAGES],
			['admin', ADMIN_PAGES]
		] as const) {
			await page.context().clearCookies();
			await signInAs(page, who);
			for (const p of pages) {
				await open(page, p);
				const e = await extent(page);
				res.push(`${who} ${p} width=${e.width.toFixed(0)} gapL=${(e.left - e.mainLeft).toFixed(0)} gapR=${(e.mainRight - e.right).toFixed(0)}`);
				expect.soft(e.width, `${who} ${p} width`).toBeLessThanOrEqual(1025);
				expect.soft(Math.abs(e.left - e.mainLeft - (e.mainRight - e.right)), `${who} ${p} centered`).toBeLessThanOrEqual(2);
			}
			if (who === 'admin') await shot(page, 'page-layout-wide-screen-admin-profile');
		}
		console.log(res.join('\n'));
		await page.goto('/');
		await page.context().clearCookies();
		await signInAs(page, 'tenant');
		await open(page, '/');
		await shot(page, 'page-layout-wide-screen-tenant-dashboard');
	});

	test('List and form pages match: Users vs Profile', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await signInAs(page, 'admin');
		await open(page, '/admin/users');
		const a = await extent(page);
		await shot(page, 'page-layout-list-and-form-pages-match-users');
		await open(page, '/profile');
		const b = await extent(page);
		await shot(page, 'page-layout-list-and-form-pages-match-profile');
		console.log('users', a, 'profile', b);
		expect(Math.abs(a.left - b.left)).toBeLessThanOrEqual(1);
		expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
	});

	for (const scheme of ['light', 'dark'] as const) {
		test(`Phone width 360px, ${scheme}: no horizontal scroll`, async ({ page }) => {
			await page.setViewportSize({ width: 360, height: 800 });
			await page.emulateMedia({ colorScheme: scheme });
			const res: string[] = [];
			for (const [who, pages] of [
				['tenant', TENANT_PAGES],
				['admin', ADMIN_PAGES]
			] as const) {
				await page.context().clearCookies();
				await signInAs(page, who);
				for (const p of pages) {
					await open(page, p);
					const o = await overflow(page);
					res.push(`${who} ${p} overflow=${o}`);
					expect.soft(o, `${who} ${p}`).toBeLessThanOrEqual(0);
					if (p === '/' && who === 'tenant') await shot(page, `page-layout-phone-width-${scheme}-tenant-dashboard`);
					if (p === '/admin/users') await shot(page, `page-layout-phone-width-${scheme}-admin-users`);
				}
			}
			console.log(res.join('\n'));
		});
	}
});

async function cardOf(page: Page, headingText: string | RegExp) {
	return page.evaluate(
		({ src, flags }) => {
			const re = new RegExp(src, flags);
			const h = [...document.querySelectorAll('main h2, main h3, main h4')].find((e) => re.test((e.textContent ?? '').trim()));
			if (!h) return null;
			// the card is the nearest ancestor with a box (border, shadow or background)
			let card: HTMLElement = h.parentElement!;
			while (card.parentElement && card.tagName !== 'MAIN') {
				const c = getComputedStyle(card);
				if (c.boxShadow !== 'none' || parseFloat(c.borderTopWidth) > 0 || c.backgroundColor !== 'rgba(0, 0, 0, 0)') break;
				card = card.parentElement;
			}
			const cs = getComputedStyle(card);
			return {
				first: card.firstElementChild === h || card.firstElementChild!.contains(h),
				pad: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '),
				cls: card.className.toString().slice(0, 120)
			};
		},
		typeof headingText === 'string' ? { src: headingText, flags: 'i' } : { src: headingText.source, flags: 'i' }
	);
}

test.describe('page-layout cards', () => {
	test.setTimeout(120_000);
	for (const w of [1280, 500]) {
		test(`Two pages' cards share padding and heading first (${w}px)`, async ({ page }) => {
			await page.setViewportSize({ width: w, height: 900 });
			await signInAs(page, 'tenant');
			await open(page, '/profile');
			const p = await cardOf(page, /^contact info$/);
			await shot(page, `page-layout-two-pages-cards-profile-${w}`);
			await open(page, '/maintenance');
			const m = await cardOf(page, /new request|add maintenance request/);
			await shot(page, `page-layout-two-pages-cards-maintenance-${w}`);
			console.log(w, JSON.stringify({ p, m }));
			expect(p, 'profile card').not.toBeNull();
			expect(m, 'maintenance card').not.toBeNull();
			expect(p!.first).toBe(true);
			expect(m!.first).toBe(true);
			expect(p!.pad).toBe(m!.pad);
			expect(p!.pad).toBe(w >= 640 ? '24px 24px 24px 24px' : '16px 16px 16px 16px');
		});
	}

	test('Dashboard lease card and admin home tile share padding', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await signInAs(page, 'tenant');
		await open(page, '/');
		const lease = await page.evaluate(() => {
			const el = [...document.querySelectorAll('main *')].find((e) => /^Monthly rent$/i.test(e.textContent?.trim() ?? '') && e.children.length === 0)!;
			// nearest decorated ancestor
			let n: Element | null = el;
			while (n && n !== document.querySelector('main')) {
				const cs = getComputedStyle(n);
				if (cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0 || cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return getComputedStyle(n).padding;
				n = n.parentElement;
			}
			return 'none';
		});
		await shot(page, 'page-layout-dashboard-and-admin-home-tenant-dashboard');
		await page.context().clearCookies();
		await signInAs(page, 'admin');
		await open(page, '/admin');
		const tile = await page.evaluate(() => {
			const a = [...document.querySelectorAll('main a')].find((e) => /Properties/.test(e.textContent ?? ''))!;
			let n: Element | null = a;
			const out: string[] = [];
			while (n && n !== document.querySelector('main')) {
				const cs = getComputedStyle(n);
				if (cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0 || cs.backgroundColor !== 'rgba(0, 0, 0, 0)') out.push(cs.padding);
				n = n.parentElement;
			}
			return out;
		});
		await shot(page, 'page-layout-dashboard-and-admin-home-admin-home');
		console.log('lease card padding', lease, 'admin tile paddings (inner->outer)', tile);
		expect(tile).toContain(lease);
	});
});

test.describe('page-layout auth cards', () => {
	test('Compare auth pages: signin vs forgot (reset needs an emailed link)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		const measure = async (path: string) => {
			await open(page, path);
			return page.evaluate(() => {
				const btn = [...document.querySelectorAll('button[type=submit]')][0] as HTMLElement;
				const form = btn.closest('form')!;
				let n: HTMLElement | null = form;
				while (n && !(getComputedStyle(n).boxShadow !== 'none' || parseFloat(getComputedStyle(n).borderTopWidth) > 0)) n = n.parentElement;
				const card = n ?? form;
				const cs = getComputedStyle(card);
				const inputs = [...form.querySelectorAll('input:not([type=hidden])')].map((i) => i.getBoundingClientRect());
				const gaps = inputs.slice(1).map((r, i) => Math.round(r.top - inputs[i].bottom));
				const last = inputs[inputs.length - 1];
				const b = btn.getBoundingClientRect();
				return {
					width: Math.round(card.getBoundingClientRect().width),
					pad: cs.padding,
					shadow: cs.boxShadow.slice(0, 60),
					fieldGaps: gaps,
					btnWidth: Math.round(b.width),
					formWidth: Math.round(form.getBoundingClientRect().width),
					btnBelowLast: Math.round(b.top - last.bottom)
				};
			});
		};
		const s = await measure('/signin');
		await shot(page, 'page-layout-compare-auth-pages-signin');
		const f = await measure('/forgot');
		await shot(page, 'page-layout-compare-auth-pages-forgot');
		console.log('signin', JSON.stringify(s), 'forgot', JSON.stringify(f));
		expect(f.width).toBe(s.width);
		expect(f.pad).toBe(s.pad);
		expect(f.shadow).toBe(s.shadow);
		expect(f.btnWidth).toBe(f.formWidth);
		expect(s.btnWidth).toBe(s.formWidth);
	});
});
