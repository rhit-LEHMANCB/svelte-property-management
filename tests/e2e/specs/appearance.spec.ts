import { expect, test, type Page } from '@playwright/test';
import { ADMIN, TENANT } from '../support/constants';
import { contrastViolations } from '../support/axe';
import { signIn } from '../support/helpers';

// appearance: one accessible theme, dark mode that follows the system, and a remembered toggle.

const html = (page: Page) => page.locator('html');

async function scanPages(page: Page) {
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	expect(await contrastViolations(page), 'sign-in page').toEqual([]);

	await signIn(page, ADMIN);
	for (const path of ['/admin', '/admin/users', '/admin/properties', '/admin/maintenance']) {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		expect(await contrastViolations(page), path).toEqual([]);
	}
	await page.context().clearCookies();

	await signIn(page, TENANT);
	for (const path of ['/', '/maintenance', '/payment', '/profile', '/insurance']) {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		expect(await contrastViolations(page), path).toEqual([]);
	}
}

test.describe('appearance: accessible color theme', () => {
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
