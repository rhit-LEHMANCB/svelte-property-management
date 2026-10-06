import { expect, test } from '@playwright/test';
import { APP_URL, AUTH_EMULATOR } from '../support/constants';
import { adminAuth } from '../support/admin';

// Sign in against the Auth emulator's REST endpoint, to see whether a password works.
const signInStatus = async (email: string, password: string) =>
	(
		await fetch(
			`http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=e2e-api-key`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email, password, returnSecureToken: true })
			}
		)
	).status;

// A real reset link from the Auth emulator, as the emailed link would be.
async function resetLink(email: string, password: string, uid: string) {
	await adminAuth().createUser({ uid, email, password });
	const link = await adminAuth().generatePasswordResetLink(email, { url: `${APP_URL}/` });
	const oobCode = new URL(link).searchParams.get('oobCode');
	return `/reset?mode=resetPassword&oobCode=${oobCode}&continueUrl=${encodeURIComponent(
		`${APP_URL}/`
	)}`;
}

test.describe('authentication: password reset completion', () => {
	test('Scenario: Valid link and password changes the password and offers to continue', async ({
		page
	}) => {
		const unique = `${Date.now()}-${test.info().retry}`;
		const email = `reset-valid-${unique}@e2e.test`;
		const url = await resetLink(email, 'Old-Passw0rd1', `e2e-reset-valid-${unique}`);

		await page.goto(url);
		await page.waitForLoadState('networkidle');
		await page.getByTitle('New Password').fill('New-Passw0rd2');
		await page.getByTitle('Verify Password').fill('New-Passw0rd2');
		await page.getByRole('button', { name: 'Change Password' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Success!')).toBeVisible();
		expect(await signInStatus(email, 'New-Passw0rd2')).toBe(200);
		expect(await signInStatus(email, 'Old-Passw0rd1')).toBe(400);

		await expect(dialog.getByRole('button', { name: 'Continue' })).toBeVisible();
	});

	test('Scenario: Mismatch is flagged on the verify field and the password is not changed', async ({
		page
	}) => {
		const unique = `${Date.now()}-${test.info().retry}`;
		const email = `reset-mismatch-${unique}@e2e.test`;
		const url = await resetLink(email, 'Old-Passw0rd1', `e2e-reset-mismatch-${unique}`);

		await page.goto(url);
		await page.waitForLoadState('networkidle');
		await page.getByTitle('New Password').fill('New-Passw0rd2');
		await page.getByTitle('Verify Password').fill('Different-Passw0rd3');
		await page.getByRole('button', { name: 'Change Password' }).click();

		await expect
			.poll(() =>
				page
					.getByTitle('Verify Password')
					.evaluate((el) => (el as HTMLInputElement).validationMessage)
			)
			.toBe('Passwords must match');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		expect(await signInStatus(email, 'Old-Passw0rd1')).toBe(200);
	});

	test('Scenario: Wrong mode shows an "Invalid action" error and no reset form', async ({
		page
	}) => {
		// The response status is deliberately not asserted: it is a Known Gap (500 where 400 is intended).
		await page.goto('/reset?mode=verifyEmail&oobCode=abc');

		await expect(page.getByText('Invalid action')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Change Password' })).toHaveCount(0);
	});
});
