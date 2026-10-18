import { test } from '@playwright/test';
import { box, expect, go, shot, signInAs } from './support';

const LEASE_PROPERTY = 'wrIhk0hPRVK1hDCaId8y';
test.use({ viewport: { width: 1280, height: 900 } });

const borderColor = (l: import('@playwright/test').Locator) =>
	l.evaluate(
		(el) =>
			getComputedStyle(el).borderColor +
			'|' +
			getComputedStyle(el).outlineColor +
			'|' +
			getComputedStyle(el).boxShadow
	);

test.describe('page-layout: field errors', () => {
	test('Missing required field + Fixing the field (Profile first name)', async ({ page }) => {
		await signInAs(page, 'tenant');
		await go(page, '/profile');
		const form = page.locator('form[action="?/contact"]');
		const first = form.getByLabel('First Name');
		const original = await first.inputValue();
		const normalColor = await borderColor(first);
		// Untouched: nothing before the first submit.
		await expect(form.locator('[data-field-error]')).toHaveCount(0);
		await first.fill('');
		await expect(form.locator('[data-field-error]'), 'no error before first submit').toHaveCount(0);
		await form.getByRole('button', { name: 'Save' }).click();
		const msg = first.locator('xpath=..').locator('[data-field-error]');
		await expect(msg).toBeVisible();
		const text = (await msg.innerText()).trim();
		const ib = await box(first);
		const mb = await box(msg);
		const errColor = await borderColor(first);
		console.log(
			'PROFILE-ERR',
			JSON.stringify({
				text,
				gap: Math.round(mb.y - (ib.y + ib.height)),
				cls: await first.getAttribute('class'),
				invalid: await first.getAttribute('aria-invalid'),
				normalColor,
				errColor
			})
		);
		expect(mb.y).toBeGreaterThanOrEqual(ib.y + ib.height - 1);
		expect(mb.y - (ib.y + ib.height)).toBeLessThan(16);
		await expect(first).toHaveAttribute('aria-invalid', 'true');
		expect(errColor).not.toBe(normalColor);
		await shot(page, 'page-layout-missing-required-field-profile', {
			target: page.locator('[data-card]', { has: form })
		});
		// Fixing: typing a value clears it without another submit.
		await first.fill('QA');
		// The QA tenant has no phone number, so the phone field keeps its own (separate) error.
		await expect(first.locator('xpath=..').locator('[data-field-error]')).toHaveCount(0);
		await expect(first).not.toHaveAttribute('aria-invalid', 'true');
		expect(await first.getAttribute('class')).not.toContain('input-error');
		await shot(page, 'page-layout-fixing-the-field-profile', {
			target: page.locator('[data-card]', { has: form })
		});
		// Restore: nothing was saved; reload shows the original value.
		await go(page, '/profile');
		await expect(page.locator('form[action="?/contact"]').getByLabel('First Name')).toHaveValue(
			original
		);
	});

	test('Untouched form: New lease shows no error before submit', async ({ page }) => {
		await signInAs(page, 'admin');
		await go(page, `/admin/properties/${LEASE_PROPERTY}/leases/new`);
		await expect(page.locator('[data-field-error]')).toHaveCount(0);
		await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
		await expect(page.locator('.input-error')).toHaveCount(0);
		// Typing and leaving a field before the first submit must not show errors either.
		await page.getByLabel('Monthly rent').fill('-5');
		await page.getByLabel('Monthly rent').blur();
		await expect(page.locator('[data-field-error]')).toHaveCount(0);
		await shot(page, 'page-layout-untouched-form-new-lease');
	});

	test('Without scripts: Forgot password shows the message under the email field', async ({
		browser
	}) => {
		const ctx = await browser.newContext({
			javaScriptEnabled: false,
			viewport: { width: 1280, height: 900 }
		});
		const page = await ctx.newPage();
		await page.goto('/forgot');
		await page.getByLabel('Email').fill('a@b');
		await page.getByRole('button', { name: 'Send reset link' }).click();
		await page.waitForLoadState('load');
		const msg = page.locator('[data-field-error]');
		const text = await msg.allInnerTexts().catch(() => []);
		const input = page.getByLabel('Email');
		console.log(
			'FORGOT-NOJS',
			JSON.stringify(text),
			await input.getAttribute('class'),
			await input.getAttribute('aria-invalid')
		);
		await expect(msg).toHaveText('Please enter a valid email.');
		await expect(input).toHaveAttribute('aria-invalid', 'true');
		expect(await input.getAttribute('class')).toContain('input-error');
		await page.screenshot({
			path: 'openspec/changes/make-ui-consistent/qa/screenshots/page-layout-without-scripts-forgot.png',
			mask: [page.locator('input[name="email"]')]
		});
		await ctx.close();
	});

	test('Sign-in errors stay form-level: no field error or invalid marking', async ({ page }) => {
		await go(page, '/signin');
		await page.getByLabel('Email').fill('qa-nobody@example.com');
		await page.getByLabel('Password').fill('not-the-password');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.locator('[data-notice="error"]')).toBeVisible();
		await expect(page.locator('[data-field-error]')).toHaveCount(0);
		await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
		await expect(page.locator('.input-error')).toHaveCount(0);
		await shot(page, 'page-layout-sign-in-errors-stay-form-level');
	});
});

test.describe('ui-accessibility', () => {
	test('Focus an invalid field + Field fixed (Insurance policy number)', async ({ page }) => {
		await signInAs(page, 'tenant');
		await go(page, '/insurance');
		const policy = page.getByLabel('Policy Number');
		await expect(policy).not.toHaveAttribute('aria-invalid', /.+/);
		await expect(policy).not.toHaveAttribute('aria-describedby', /.+/);
		await policy.fill('');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(policy).toHaveAttribute('aria-invalid', 'true');
		const describedBy = await policy.getAttribute('aria-describedby');
		expect(describedBy).toBeTruthy();
		const described = await page.locator(`#${describedBy!.split(' ')[0]}`).innerText();
		await policy.focus();
		const ax = await page.accessibility
			?.snapshot?.({ root: (await policy.elementHandle()) ?? undefined })
			.catch(() => null);
		console.log('INSURANCE-ARIA', JSON.stringify({ describedBy, described, ax }));
		expect(described.trim().length).toBeGreaterThan(0);
		await shot(page, 'ui-accessibility-focus-an-invalid-field-insurance', {
			target: page.locator('[data-card]').first()
		});
		await policy.fill('QA-12345');
		await expect(policy).not.toHaveAttribute('aria-invalid', 'true');
		const after = await policy.getAttribute('aria-describedby');
		expect(after ?? '').not.toContain('error');
		await expect(page.locator(`#${describedBy!.split(' ')[0]}`)).toHaveCount(0);
		await shot(page, 'ui-accessibility-field-fixed-insurance', {
			target: page.locator('[data-card]').first()
		});
	});

	test('Landmark navigation: Breadcrumb nav, ordered list, last crumb is the current page', async ({
		page
	}) => {
		await signInAs(page, 'admin');
		await go(page, `/admin/properties/${LEASE_PROPERTY}/leases/migrated-wrIhk0hPRVK1hDCaId8y`);
		const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
		await expect(nav).toHaveCount(1);
		await expect(nav.locator('ol > li')).toHaveCount(3);
		const last = nav.locator('li').last().locator('[aria-current="page"]');
		await expect(last).toHaveText('Edit lease');
		await expect(nav.locator('li').last().getByRole('link')).toHaveCount(0);
		await expect(nav.locator('li').first().getByRole('link', { name: 'Properties' })).toBeVisible();
		const tree = await nav.ariaSnapshot();
		console.log('BREADCRUMB-ARIA', tree);
		await shot(page, 'ui-accessibility-landmark-navigation-breadcrumb', { target: nav });
	});
});
