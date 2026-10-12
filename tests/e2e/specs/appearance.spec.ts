import { expect, test, type Page } from '@playwright/test';
import { ADMIN, TENANT } from '../support/constants';
import { contrastViolations } from '../support/contrast';
import { signIn } from '../support/helpers';

// appearance: one accessible theme, dark mode that follows the system, and a remembered toggle.

const html = (page: Page) => page.locator('html');

async function check(page: Page, where: string) {
	expect(await contrastViolations(page), where).toEqual([]);
}

async function scanPages(page: Page) {
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	await check(page, 'sign-in page');

	await signIn(page, ADMIN);
	for (const path of ['/admin', '/admin/users', '/admin/properties', '/admin/maintenance']) {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		await check(page, path);
	}
	// States with filled colors: a menu, a confirmation, the user-info dialog with its red Delete
	// button, and an error toast.
	await page.goto('/admin/users');
	await page.waitForLoadState('networkidle');
	await page
		.getByRole('button', { name: /^Actions for / })
		.first()
		.click();
	await check(page, 'row menu');
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	await check(page, 'confirmation dialog');
	await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
	await page
		.getByRole('button', { name: `${ADMIN.firstName} ${ADMIN.lastName}`, exact: true })
		.click();
	await check(page, 'user-info dialog');
	await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
	await page.context().clearCookies();

	await signIn(page, TENANT);
	for (const path of ['/', '/maintenance', '/payment', '/profile', '/insurance']) {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		await check(page, path);
	}
	await page.route('**/api/signin/reset', (route) => route.fulfill({ status: 500, body: '{}' }));
	await page.goto('/profile');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Reset', exact: true }).click();
	await expect(page.getByRole('alert')).toBeVisible();
	// The toast fades in; measure it once it has settled.
	await expect.poll(() => contrastViolations(page), { message: 'error toast' }).toEqual([]);
}

test.describe('appearance: the contrast check catches low contrast', () => {
	test('a light gray probe on white is reported', async ({ page }) => {
		await page.goto('/signin');
		await page.evaluate(() => {
			const probe = document.createElement('p');
			probe.textContent = 'low contrast probe';
			probe.style.cssText = 'color:#ccc;background:#fff;font-size:16px';
			document.body.prepend(probe);
		});

		expect((await contrastViolations(page)).join('\n')).toContain('low contrast probe');
	});
});

test.describe('appearance: accessible color theme', () => {
	// Each scan visits about a dozen pages and states.
	test.describe.configure({ timeout: 120_000 });

	test('Scenario: Contrast in light mode', async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: 'light' });
		const page = await context.newPage();
		await scanPages(page);
		await expect(html(page)).toHaveCSS('color-scheme', 'light');
		await context.close();
	});

	test('Scenario: Contrast in dark mode', async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: 'dark' });
		const page = await context.newPage();
		await scanPages(page);
		await expect(html(page)).toHaveCSS('color-scheme', 'dark');
		await context.close();
	});
});

test.describe('appearance: dark mode follows the system by default', () => {
	test('Scenario: System prefers dark', async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: 'dark' });
		const page = await context.newPage();
		await page.goto('/signin');

		await expect(html(page)).toHaveClass(/\bdark\b/);
		await expect(html(page)).toHaveCSS('color-scheme', 'dark');
		await context.close();
	});

	test('Scenario: No flash (dark is applied before the app scripts run)', async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: 'dark' });
		const page = await context.newPage();
		// With the app's scripts blocked, only the inline script in app.html can set the mode.
		await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
		await page.goto('/signin');

		await expect(html(page)).toHaveClass(/\bdark\b/);
		await expect(html(page)).toHaveCSS('color-scheme', 'dark');
		await expect(html(page)).not.toHaveAttribute('data-hydrated', '');
		await context.close();
	});
});

test.describe('appearance: manual dark mode toggle', () => {
	test('Scenario: Toggle and reload', async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: 'light' });
		const page = await context.newPage();
		await signIn(page, TENANT);
		const toggle = page.getByRole('button', { name: 'Dark mode' });
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		await expect(html(page)).toHaveCSS('color-scheme', 'dark');

		await page.reload();
		await expect(html(page)).toHaveCSS('color-scheme', 'dark');
		await expect(page.getByRole('button', { name: 'Dark mode' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await context.close();
	});

	test('Scenario: Override the system', async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: 'dark' });
		const page = await context.newPage();
		await signIn(page, TENANT);
		const toggle = page.getByRole('button', { name: 'Dark mode' });
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');

		await toggle.click();
		await page.reload();

		await expect(html(page)).toHaveCSS('color-scheme', 'light');
		await expect(html(page)).not.toHaveClass(/\bdark\b/);
		await context.close();
	});

	test('Scenario: Toggle by keyboard', async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: 'light' });
		const page = await context.newPage();
		await signIn(page, TENANT);
		const toggle = page.getByRole('button', { name: 'Dark mode' });

		await toggle.focus();
		await page.keyboard.press('Enter');
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		await page.keyboard.press('Space');
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');
		await expect(html(page)).toHaveCSS('color-scheme', 'light');
		await context.close();
	});

	test('Scenario: Blocked storage still lets the toggle work for the page', async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: 'light' });
		await context.addInitScript(() => {
			const blocked = () => {
				throw new DOMException('Blocked', 'SecurityError');
			};
			Storage.prototype.getItem = blocked;
			Storage.prototype.setItem = blocked;
		});
		const page = await context.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await signIn(page, TENANT);

		await page.getByRole('button', { name: 'Dark mode' }).click();

		await expect(html(page)).toHaveCSS('color-scheme', 'dark');
		expect(errors).toEqual([]);
		await context.close();
	});
});

test.describe('appearance: pages without scripts stay readable', () => {
	test('Scenario: No scripts', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'dark' });
		const page = await context.newPage();
		await page.goto('/signin');

		await expect(html(page)).toHaveCSS('color-scheme', 'dark');
		await expect(html(page)).not.toHaveClass(/\b(dark|light)\b/);
		await context.close();
	});

	test('Scenario: No scripts keeps AA contrast in the system mode', async ({ browser }) => {
		// axe needs scripts, so instead of turning them off, serve the page with a policy that blocks
		// every page script (the inline mode script included). The page then gets the same CSS-only
		// rendering as a browser without scripts, and axe still runs from Playwright.
		for (const colorScheme of ['dark', 'light'] as const) {
			const context = await browser.newContext({ colorScheme });
			const page = await context.newPage();
			await page.route('**/signin', async (route) => {
				const response = await route.fetch();
				await route.fulfill({
					response,
					headers: { ...response.headers(), 'content-security-policy': "script-src 'none'" }
				});
			});
			await page.goto('/signin');

			// The inline script did not run, so the mode comes from the CSS fallback alone.
			await expect(html(page)).not.toHaveClass(/\b(dark|light)\b/);
			await expect(html(page)).toHaveCSS('color-scheme', colorScheme);
			expect(await contrastViolations(page), colorScheme).toEqual([]);
			await context.close();
		}
	});
});
