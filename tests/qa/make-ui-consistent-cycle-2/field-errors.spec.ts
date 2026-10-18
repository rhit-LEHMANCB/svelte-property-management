import { test, expect, type Locator, type Page } from '@playwright/test';
import { QA_PROPERTY, box, open, shot, signInAs } from './support';

test.use({ viewport: { width: 1280, height: 1300 } });
test.setTimeout(120_000);

/** What a field looks like to the user and to assistive tech. */
async function fieldState(input: Locator) {
	return input.evaluate((el) => {
		const cs = getComputedStyle(el);
		const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
		const desc = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
		const r = el.getBoundingClientRect();
		return {
			invalid: el.getAttribute('aria-invalid'),
			border: cs.borderColor,
			borderW: cs.borderTopWidth,
			outline: cs.outlineColor + ' ' + cs.outlineWidth,
			shadow: cs.boxShadow,
			descText: desc.map((d) => (d.textContent ?? '').trim()).join(' | '),
			descVisible: desc.some((d) => d.getBoundingClientRect().height > 0),
			descTopGap: desc.length ? Math.round(desc[0].getBoundingClientRect().top - r.bottom) : null,
			descBelow: desc.length ? desc[0].getBoundingClientRect().top >= r.bottom - 1 : null
		};
	});
}
const hasRedOklch = (c: string) =>
	[...c.matchAll(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g)].some((m) => +m[2] > 0.15 && +m[3] > 10 && +m[3] < 40);
const isRedish = (c: string) => {
	const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
	return !!m && +m[1] > 150 && +m[2] < 120 && +m[3] < 120;
};

test.describe('page-layout field errors', () => {
	test('Missing required field + Fixing the field (Profile first name)', async ({ page }) => {
		await signInAs(page, 'tenant');
		await open(page, '/profile');
		const first = page.getByLabel('First Name');
		const original = await first.inputValue();
		try {
			const before = await fieldState(first);
			expect(before.invalid).toBeNull();
			expect(before.descText).toBe('');
			await first.fill('');
			await page.getByRole('button', { name: 'Save', exact: true }).click();
			await expect(first).toHaveAttribute('aria-invalid', 'true');
			const st = await fieldState(first);
			console.log('profile invalid state', JSON.stringify(st));
			expect(st.descText.length).toBeGreaterThan(0);
			expect(st.descVisible).toBe(true);
			expect(st.descBelow).toBe(true);
			expect(st.descTopGap).toBeLessThanOrEqual(16);
			expect(isRedish(st.border) || isRedish(st.outline) || hasRedOklch(st.shadow), `error outline ${st.border} ${st.outline} ${st.shadow}`).toBe(true);
			await shot(page, 'page-layout-missing-required-field-profile');
			await first.fill('Q');
			await expect(first).not.toHaveAttribute('aria-invalid', 'true');
			const fixed = await fieldState(first);
			expect(fixed.descText).toBe('');
			expect(isRedish(fixed.border) || hasRedOklch(fixed.shadow)).toBe(false);
			await shot(page, 'page-layout-fixing-the-field-profile');
		} finally {
			await first.fill(original);
			// nothing was saved with the temporary values; reload to be sure the stored value is unchanged
			await open(page, '/profile');
			expect(await page.getByLabel('First Name').inputValue()).toBe(original);
		}
	});

	test('Untouched form: New lease shows no error before submit; then required fields show errors', async ({ page }) => {
		await signInAs(page, 'admin');
		await open(page, `/admin/properties/${QA_PROPERTY}/leases/new`);
		expect(await page.locator('main [aria-invalid="true"]').count()).toBe(0);
		await shot(page, 'page-layout-untouched-form-new-lease');
		await page.getByRole('button', { name: 'Save lease' }).click();
		await page.waitForTimeout(700);
		const n = await page.locator('main [aria-invalid="true"]').count();
		console.log('new lease invalid fields after submit', n);
		expect(n).toBeGreaterThan(0);
		await shot(page, 'page-layout-untouched-form-new-lease-after-submit');
	});

	test('Dialog field: Make a Payment amount above balance (nothing sent)', async ({ page }) => {
		const sent: string[] = [];
		page.on('request', (r) => {
			if (r.method() !== 'GET' && !/google|firebase|gstatic/.test(r.url())) sent.push(r.method() + ' ' + r.url());
		});
		await signInAs(page, 'tenant');
		await open(page, '/payment');
		await page.getByRole('button', { name: 'Make a Payment' }).first().click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		const amount = dialog.getByLabel(/amount/i).first();
		await amount.fill('999999');
		sent.length = 0;
		await dialog.getByRole('button', { name: /continue|pay|submit/i }).last().click();
		await page.waitForTimeout(800);
		await expect(dialog).toBeVisible();
		const st = await fieldState(amount);
		console.log('dialog amount', JSON.stringify(st), 'requests', JSON.stringify(sent));
		expect(st.invalid).toBe('true');
		expect(st.descText.length).toBeGreaterThan(0);
		expect(st.descBelow).toBe(true);
		expect(sent).toEqual([]);
		await shot(page, 'page-layout-dialog-field-make-a-payment');
	});

	test('Without scripts: Forgot password rejects an email server-side and shows it under the field', async ({ browser, baseURL }) => {
		const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
		const page = await ctx.newPage();
		await page.goto('/forgot');
		const email = page.getByLabel('Email');
		await email.fill('a@b');
		await page.getByRole('button', { name: 'Send reset link' }).click();
		await page.waitForLoadState('load');
		const body = await page.locator('body').innerText();
		console.log('no-js forgot result:', body.replace(/\s+/g, ' ').slice(0, 300));
		await shot(page, 'page-layout-without-scripts-forgot');
		await expect(page.getByText('Please enter a valid email.')).toBeVisible();
		const st = await fieldState(page.getByLabel('Email'));
		console.log('no-js state', JSON.stringify(st));
		expect(st.invalid).toBe('true');
		expect(st.descBelow).toBe(true);
		await ctx.close();
	});
});

test.describe('ui-accessibility', () => {
	test('Focus an invalid field + Field fixed (Insurance policy number)', async ({ page }) => {
		await signInAs(page, 'tenant');
		await open(page, '/insurance');
		const policy = page.getByLabel('Policy Number');
		const original = await policy.inputValue();
		expect(original, 'tenant has no policy on file (Missing state) so submit saves nothing').toBe('');
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(policy).toHaveAttribute('aria-invalid', 'true');
		await policy.focus();
		const st = await fieldState(policy);
		console.log('policy invalid', JSON.stringify(st));
		expect(st.descText.length).toBeGreaterThan(0);
		await shot(page, 'ui-accessibility-focus-an-invalid-field-insurance');
		await policy.fill('QA-1234');
		await expect(policy).not.toHaveAttribute('aria-invalid', 'true');
		const after = await fieldState(policy);
		expect(after.descText).toBe('');
		expect(await policy.getAttribute('aria-describedby')).toBeNull();
		await shot(page, 'ui-accessibility-field-fixed-insurance');
		// leave without saving
		await open(page, '/insurance');
		expect(await page.getByLabel('Policy Number').inputValue()).toBe('');
	});

	test('Landmark navigation: Breadcrumb nav, ordered list, last crumb is the current page', async ({ page }) => {
		await signInAs(page, 'admin');
		await open(page, `/admin/properties/${QA_PROPERTY}/leases/new`);
		const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
		await expect(nav).toHaveCount(1);
		expect(await nav.locator('ol > li').count()).toBeGreaterThanOrEqual(3);
		const last = nav.locator('li').last();
		await expect(last.locator('[aria-current="page"]').or(last.and(page.locator('[aria-current="page"]')))).toHaveCount(1);
		await expect(last.locator('a')).toHaveCount(0);
		await shot(page, 'ui-accessibility-landmark-navigation-breadcrumbs');
	});
});
