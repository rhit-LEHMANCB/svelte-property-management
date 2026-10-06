import { expect, test } from '@playwright/test';
import { TENANT } from '../support/constants';
import { signIn } from '../support/helpers';

// The reset email goes out through SendGrid, which end-to-end runs never reach, so the browser's
// request to the app is answered here. This checks the page's wiring: what it sends and what it shows.
test.describe('user-profile: request password reset', () => {
	test('Scenario: Reset button sends PUT /api/signin/reset for the user and shows a success toast', async ({
		page
	}) => {
		let sent: { method: string; body: unknown } | undefined;
		await page.route('**/api/signin/reset', async (route) => {
			sent = { method: route.request().method(), body: route.request().postDataJSON() };
			await route.fulfill({ json: { status: 'email_sent' } });
		});
		await signIn(page, TENANT);
		await page.goto('/profile');
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Reset', exact: true }).click();

		await expect(page.getByText('Reset email successfully sent.')).toBeVisible();
		expect(sent).toEqual({ method: 'PUT', body: { email: TENANT.email } });
	});

	test('Scenario: a failed request shows an error toast', async ({ page }) => {
		await page.route('**/api/signin/reset', (route) => route.fulfill({ status: 500, body: '{}' }));
		await signIn(page, TENANT);
		await page.goto('/profile');
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Reset', exact: true }).click();

		await expect(page.getByText('Error sending reset email.')).toBeVisible();
	});
});
