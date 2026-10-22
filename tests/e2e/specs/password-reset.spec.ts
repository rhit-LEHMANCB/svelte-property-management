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

	test('Scenario: Pressing Enter in the form submits it and changes the password', async ({
		page
	}) => {
		const unique = `${Date.now()}-${test.info().retry}`;
		const email = `reset-enter-${unique}@e2e.test`;
		const url = await resetLink(email, 'Old-Passw0rd1', `e2e-reset-enter-${unique}`);

		await page.goto(url);
		await page.waitForLoadState('networkidle');
		await page.getByTitle('New Password').fill('New-Passw0rd2');
		await page.getByTitle('Verify Password').fill('New-Passw0rd2');
		await page.getByTitle('Verify Password').press('Enter');

		await expect(page.getByRole('dialog').getByText('Success!')).toBeVisible();
		expect(await signInStatus(email, 'New-Passw0rd2')).toBe(200);
	});

	test('Scenario: Enter with mismatched passwords shows the error and does not post the form', async ({
		page
	}) => {
		const unique = `${Date.now()}-${test.info().retry}`;
		const email = `reset-enter-bad-${unique}@e2e.test`;
		const url = await resetLink(email, 'Old-Passw0rd1', `e2e-reset-enter-bad-${unique}`);

		await page.goto(url);
		await page.waitForLoadState('networkidle');
		await page.getByTitle('New Password').fill('New-Passw0rd2');
		await page.getByTitle('Verify Password').fill('Different-Passw0rd3');
		await page.getByTitle('Verify Password').press('Enter');

		await expect
			.poll(() => page.getByTitle('Verify Password').getAttribute('aria-invalid'))
			.toBe('true');
		expect(page.url()).not.toContain('Passw0rd');
		expect(await signInStatus(email, 'Old-Passw0rd1')).toBe(200);
	});

	test('Scenario: Submitting before the page is interactive does not put the passwords in the URL', async ({
		browser
	}) => {
		const unique = `${Date.now()}-${test.info().retry}`;
		const email = `reset-nojs-${unique}@e2e.test`;
		const url = await resetLink(email, 'Old-Passw0rd1', `e2e-reset-nojs-${unique}`);
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();

		await page.goto(url);
		await page.getByTitle('New Password').fill('New-Passw0rd2');
		await page.getByTitle('Verify Password').fill('New-Passw0rd2');
		await page.getByTitle('Verify Password').press('Enter');
		await page.waitForLoadState('load');

		expect(page.url()).not.toContain('Passw0rd');
		expect(await signInStatus(email, 'Old-Passw0rd1')).toBe(200);
		await context.close();
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
			.poll(() => page.getByTitle('Verify Password').getAttribute('aria-invalid'))
			.toBe('true');
		await expect(page.getByTitle('Verify Password')).toHaveAccessibleDescription(
			'Passwords must match'
		);
		await expect(page.getByRole('dialog')).toHaveCount(0);
		expect(await signInStatus(email, 'Old-Passw0rd1')).toBe(200);
	});

	test('Scenario: Wrong mode responds 400 "Invalid action" and shows no reset form', async ({
		page
	}) => {
		const response = await page.goto('/reset?mode=verifyEmail&oobCode=abc');

		expect(response?.status()).toBe(400);
		await expect(page.getByText('Invalid action')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Change Password' })).toHaveCount(0);
	});

	test('Scenario: Missing code responds 400 "Invalid action"', async ({ page }) => {
		const response = await page.goto('/reset?mode=resetPassword');

		expect(response?.status()).toBe(400);
		await expect(page.getByRole('button', { name: 'Change Password' })).toHaveCount(0);
	});

	test('Scenario: Continue after a reset goes to /signin with the notice, no "Leave site?" prompt, whatever continueUrl says', async ({
		page
	}) => {
		const unique = `${Date.now()}-${test.info().retry}`;
		const email = `reset-continue-${unique}@e2e.test`;
		const link = await resetLink(email, 'Old-Passw0rd1', `e2e-reset-continue-${unique}`);
		const foreign = link.replace(
			/continueUrl=[^&]*/,
			`continueUrl=${encodeURIComponent('https://example.com/elsewhere')}`
		);
		const dialogs: string[] = [];
		page.on('dialog', async (dialog) => {
			dialogs.push(dialog.type());
			await dialog.dismiss();
		});

		await page.goto(foreign);
		await page.waitForLoadState('networkidle');
		await page.getByTitle('New Password').fill('New-Passw0rd2');
		await page.getByTitle('Verify Password').fill('New-Passw0rd2');
		await page.getByRole('button', { name: 'Change Password' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();

		await expect(page).toHaveURL(`${APP_URL}/signin?reset=success`);
		await expect(page.getByText('Your password was changed. Please sign in.')).toBeVisible();
		expect(dialogs).toEqual([]);
	});
});
