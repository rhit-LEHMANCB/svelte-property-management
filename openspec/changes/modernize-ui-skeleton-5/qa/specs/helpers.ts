import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';

export const SHOTS = path.resolve(
	process.cwd(),
	'openspec/changes/modernize-ui-skeleton-5/qa/screenshots'
);

/**
 * Saves a screenshot with email addresses and phone numbers masked (page text and field values are
 * swapped for placeholders only while the picture is taken, then restored), so no QA account email or
 * real contact detail ends up in the evidence.
 */
export async function shot(page: Page, name: string, fullPage = false) {
	await page.evaluate(() => {
		const w = window as unknown as { __qaMasked?: (() => void)[] };
		w.__qaMasked = [];
		const email = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
		const phone = /\(\d{3}\) \d{3}-\d{4}/g;
		const mask = (t: string) => t.replace(email, 'user@masked.example').replace(phone, '(###) ###-####');
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		let n: Node | null;
		while ((n = walker.nextNode())) {
			const orig = n.nodeValue ?? '';
			const m = mask(orig);
			if (m !== orig) {
				const node = n;
				node.nodeValue = m;
				w.__qaMasked.push(() => (node.nodeValue = orig));
			}
		}
		document.querySelectorAll('input, textarea').forEach((el) => {
			const input = el as HTMLInputElement;
			if (input.type === 'password' || !input.value) return;
			const orig = input.value;
			if (input.type === 'email' || mask(orig) !== orig) {
				if (input.type === 'email') {
					input.type = 'text';
					input.value = 'user@masked.example';
					w.__qaMasked!.push(() => {
						input.value = orig;
						input.type = 'email';
					});
				} else {
					input.value = mask(orig);
					w.__qaMasked!.push(() => (input.value = orig));
				}
			}
		});
	});
	try {
		await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
	} finally {
		await page.evaluate(() => {
			const w = window as unknown as { __qaMasked?: (() => void)[] };
			(w.__qaMasked ?? []).forEach((undo) => undo());
			w.__qaMasked = [];
		});
	}
}

export type Role = 'admin' | 'tenant';

function creds(role: Role) {
	const email = process.env[role === 'admin' ? 'QA_ADMIN_EMAIL' : 'QA_TENANT_EMAIL'];
	const password = process.env[role === 'admin' ? 'QA_ADMIN_PASSWORD' : 'QA_TENANT_PASSWORD'];
	if (!email || !password) throw new Error(`Missing QA ${role} credentials in environment`);
	return { email, password };
}

/**
 * Waits for the app to hydrate (html[data-hydrated]). It rarely stays in its inert pre-hydration state
 * (seen 3 times in ~170 page loads); the cause is logged (pending requests, console errors) and the page
 * is reloaded once, so the run can go on.
 */
export async function hydrate(page: Page, timeout = 10000) {
	const pending = new Set<string>();
	const problems: string[] = [];
	const onReq = (r: { url(): string }) => pending.add(r.url());
	const onDone = (r: { url(): string }) => pending.delete(r.url());
	const onErr = (m: { type(): string; text(): string }) => {
		if (m.type() === 'error') problems.push(m.text().slice(0, 160));
	};
	page.on('request', onReq);
	page.on('requestfinished', onDone);
	page.on('requestfailed', onDone);
	page.on('console', onErr);
	try {
		await page.locator('html[data-hydrated]').waitFor({ timeout });
	} catch {
		console.log(
			`NOTE page did not hydrate within ${timeout} ms at ${new URL(page.url()).pathname}; pending requests: ${[...pending].map((u) => u.slice(0, 80)).join(' | ') || 'none'}; console errors: ${problems.join(' | ') || 'none'}; reloading once`
		);
		await page.reload();
		await page.locator('html[data-hydrated]').waitFor({ timeout: 20000 });
	} finally {
		page.off('request', onReq);
		page.off('requestfinished', onDone);
		page.off('requestfailed', onDone);
		page.off('console', onErr);
	}
}

/** Signs in through the UI. Passwords are never logged. */
export async function signIn(page: Page, role: Role) {
	const { email, password } = creds(role);
	await page.goto('/signin');
	await hydrate(page);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL((url) => !url.pathname.startsWith('/signin'), { timeout: 30000 });
	await expect(page.getByRole('banner').or(page.locator('header')).first()).toBeVisible();
}

export async function newSignedInContext(
	browser: Browser,
	role: Role,
	options: Parameters<Browser['newContext']>[0] = {}
): Promise<{ context: BrowserContext; page: Page }> {
	const context = await browser.newContext(options);
	const page = await context.newPage();
	await signIn(page, role);
	return { context, page };
}

export async function setTheme(page: Page, mode: 'light' | 'dark') {
	await page.evaluate((m) => {
		localStorage.setItem('theme', m);
	}, mode);
	await page.reload();
	await page.waitForLoadState('networkidle');
}

/**
 * In-page WCAG contrast measurement. Returns every text element below AA, excluding the spec's
 * accepted exception (filled color controls: preset-filled*, badges, toasts with filled presets,
 * and the current navigation entry).
 */
export const MEASURE_SOURCE = `(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  function parse(c) {
    cx.clearRect(0,0,1,1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0,0,1,1);
    const d = cx.getImageData(0,0,1,1).data; return [d[0], d[1], d[2], d[3]/255];
  }
  function over(top, bottom) {
    const a = top[3] + bottom[3]*(1-top[3]);
    if (a === 0) return [0,0,0,0];
    return [0,1,2].map(i => (top[i]*top[3] + bottom[i]*bottom[3]*(1-top[3]))/a).concat([a]);
  }
  const lin = v => { v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
  const lum = c => 0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);
  const ratio = (a,b) => { const l1=lum(a), l2=lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
  function bgOf(el) {
    // composite backgrounds from el upward to the root, then white/black canvas
    const layers = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && /gradient|url/.test(cs.backgroundImage)) return { c: null, unknown: true };
      const bg = parse(cs.backgroundColor);
      if (bg[3] > 0) layers.push(bg);
      if (bg[3] >= 1) break;
      n = n.parentElement;
    }
    let acc = [255,255,255,1];
    const rc = document.documentElement.classList; const rootDark = rc.contains('dark') || (!rc.contains('light') && matchMedia('(prefers-color-scheme: dark)').matches);
    if (!layers.length || layers[layers.length-1][3] < 1) acc = rootDark ? [0,0,0,1] : [255,255,255,1];
    else acc = layers.pop();
    while (layers.length) acc = over(layers.pop(), acc);
    return { c: acc };
  }
  function opacityOf(el) {
    let o = 1; let n = el;
    while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
    return o;
  }
  function exempt(el) {
    return !!el.closest('[class*="preset-filled"], .badge, .badge-icon, .chip[class*="preset-filled"], [aria-current="page"]');
  }
  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    // clip-based sr-only
    if (r.width <= 1 && r.height <= 1) return false;
    return true;
  }
  const out = []; const exemptLow = []; const disabledLow = []; let checked = 0, exemptCount = 0;
  const scopeSel = window.__qaScope; const scopeRoot = scopeSel ? document.querySelector(scopeSel) : document.body; if (!scopeRoot) return { checked: 0, exemptCount: 0, failures: [{ text: 'scope not found ' + scopeSel }] };
  const walker = document.createTreeWalker(scopeRoot, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let t;
  while ((t = walker.nextNode())) {
    const text = t.nodeValue.trim(); if (!text) continue;
    const el = t.parentElement; if (!el || seen.has(el)) continue;
    if (['SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName)) continue;
    if (!visible(el)) continue;
    seen.add(el);
    if (el.closest('[hidden], [inert]') && getComputedStyle(el).display==='none') continue;
    const cs = getComputedStyle(el);
    const bg = bgOf(el);
    if (bg.unknown) { out.push({ text: text.slice(0,40), note: 'background image/gradient, not measurable', unknown: true }); continue; }
    const op = opacityOf(el);
    let fg = parse(cs.color);
    fg = [fg[0], fg[1], fg[2], fg[3]*op];
    const fgc = over(fg, bg.c);
    const r = ratio(fgc, bg.c);
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight)||400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const isExempt = exempt(el);
    if (el.closest('button:disabled, [disabled], [aria-disabled="true"]')) { disabledLow.push({ text: text.slice(0,30), ratio: Math.round(r*100)/100 }); continue; }
    checked++;
    if (isExempt) { exemptCount++; if (r < need) exemptLow.push({ text: text.slice(0,30), ratio: Math.round(r*100)/100, cls: (typeof el.className === 'string' ? el.className : '').slice(0,50) }); continue; }
    if (r < need) out.push({ text: text.slice(0,50), tag: el.tagName.toLowerCase(), cls: (el.className&&el.className.baseVal===undefined? el.className : '').toString().slice(0,60), ratio: Math.round(r*100)/100, need, fg: fgc.slice(0,3).map(Math.round).join(','), bg: bg.c.slice(0,3).map(Math.round).join(',') });
  }
  // form fields: typed value and placeholder text are not text nodes
  scopeRoot.querySelectorAll('input, textarea, select').forEach((el) => {
    if (el.disabled || !visible(el) || ['checkbox','radio','hidden','file','range'].includes(el.type)) return;
    const bg = bgOf(el); if (bg.unknown) return;
    const cs = getComputedStyle(el);
    const check = (color, what, op) => {
      let fg = parse(color); fg = [fg[0], fg[1], fg[2], fg[3]*op];
      const fgc = over(fg, bg.c); const r = ratio(fgc, bg.c); checked++;
      if (r < 4.5) out.push({ text: what + ' ' + (el.getAttribute('aria-label') || el.placeholder || el.name || el.id || '').slice(0,30), tag: el.tagName.toLowerCase(), ratio: Math.round(r*100)/100, need: 4.5, fg: fgc.slice(0,3).map(Math.round).join(','), bg: bg.c.slice(0,3).map(Math.round).join(',') });
    };
    const op = opacityOf(el);
    if (el.value) check(cs.color, 'value of', op);
    if (el.placeholder && !el.value) check(getComputedStyle(el, '::placeholder').color, 'placeholder of', op);
  });
  return { checked, exemptCount, exemptLow, disabledLow, failures: out, links: scopeRoot.querySelectorAll('a').length };
})()`;

export async function measureContrast(page: Page, scope?: string) {
	await page.evaluate((sel) => {
		(window as unknown as { __qaScope?: string }).__qaScope = sel;
	}, scope);
	return (await page.evaluate(MEASURE_SOURCE)) as {
		checked: number;
		exemptCount: number;
		exemptLow?: { text: string; ratio: number; cls: string }[];
		disabledLow?: { text: string; ratio: number }[];
		links?: number;
		failures: {
			text: string;
			tag?: string;
			cls?: string;
			ratio?: number;
			need?: number;
			fg?: string;
			bg?: string;
			unknown?: boolean;
			note?: string;
		}[];
	};
}

/** Proves the measurement catches a known low-contrast sample (#aaa on #fff = 2.32:1). */
export async function selfTestMeasure(page: Page) {
	await page.evaluate(() => {
		const d = document.createElement('div');
		d.id = 'qa-contrast-sample';
		d.style.cssText =
			'position:fixed;top:0;left:0;z-index:99999;background:#fff;color:#aaaaaa;padding:8px;font-size:16px';
		d.textContent = 'qa low contrast sample';
		document.body.appendChild(d);
		const ok = document.createElement('div');
		ok.id = 'qa-contrast-ok';
		ok.style.cssText =
			'position:fixed;top:40px;left:0;z-index:99999;background:#fff;color:#595959;padding:8px;font-size:16px';
		ok.textContent = 'qa fine contrast sample';
		document.body.appendChild(ok);
		const inp = document.createElement('input');
		inp.id = 'qa-contrast-input';
		inp.value = 'qa low input value';
		inp.style.cssText =
			'position:fixed;top:80px;left:0;z-index:99999;background:#fff;color:#aaaaaa;font-size:16px;width:200px';
		document.body.appendChild(inp);
	});
	const res = await measureContrast(page);
	await page.evaluate(() => {
		document.getElementById('qa-contrast-sample')?.remove();
		document.getElementById('qa-contrast-ok')?.remove();
		document.getElementById('qa-contrast-input')?.remove();
	});
	expect(
		res.failures.find((f) => f.text.includes('value of')),
		'form field values are measured too'
	).toBeTruthy();
	// #595959 on #fff is 7.0:1, so it must not be flagged
	expect(res.failures.find((f) => f.text.includes('qa fine contrast sample'))).toBeFalsy();
	const hit = res.failures.find((f) => f.text.includes('qa low contrast sample'));
	expect(hit, 'measurement must flag the known low-contrast sample').toBeTruthy();
	expect(hit!.ratio!).toBeLessThan(2.5);
}
