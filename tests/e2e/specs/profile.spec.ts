import { expect, test } from '@playwright/test';
import { TENANT } from '../support/constants';
import { adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

// The reset email goes out through Resend, which end-to-end runs never reach, so the browser's
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

		await expect(page.getByText('Reset email requested. Check your inbox.')).toBeVisible();
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

test.describe('user-profile: changing the email asks for the current password', () => {
	test('Scenario: the password field appears only when the email is edited, and a wrong password changes nothing', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/profile');
		await page.waitForLoadState('networkidle');
		const password = page.getByLabel('Current password');

		await expect(password).toHaveCount(0);

		const email = page.getByLabel('Email', { exact: true });
		await email.fill('someone-else@e2e.test');
		await expect(password).toBeVisible();

		await password.fill('not-the-password');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Enter your current password to change your email.')).toBeVisible();

		await page.reload();
		await page.waitForLoadState('networkidle');
		await expect(page.getByLabel('Email', { exact: true })).toHaveValue(TENANT.email);
	});
});

test.describe('user-profile: saving contact info', () => {
	test.afterEach(async () => {
		await adminDb().doc(`users/${TENANT.uid}`).update({
			firstName: TENANT.firstName,
			lastName: TENANT.lastName,
			phoneNumber: TENANT.phoneNumber
		});
	});

	test('Scenario: the form keeps the saved values after a successful save, without a reload', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/profile');
		await page.waitForLoadState('networkidle');

		await page.getByLabel('First Name').fill('Tess');
		await page.getByLabel('Last Name').fill('Renter');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Successfully updated user info.')).toBeVisible();
		await page.waitForLoadState('networkidle');

		await expect(page.getByLabel('First Name')).toHaveValue('Tess');
		await expect(page.getByLabel('Last Name')).toHaveValue('Renter');

		await page.reload();
		await page.waitForLoadState('networkidle');
		await expect(page.getByLabel('First Name')).toHaveValue('Tess');
		await expect(page.getByLabel('Last Name')).toHaveValue('Renter');
	});
});
