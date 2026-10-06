import { expect, type Page } from '@playwright/test';

type Account = { email: string; password: string };

/** Sign in through the real sign-in page and wait until the app has left it. */
export async function signIn(page: Page, account: Account) {
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(account.email);
	await page.getByLabel('Password').fill(account.password);
	// A late dev-server reload would clear the fields; fail clearly instead of clicking an empty form.
	await expect(page.getByLabel('Email')).toHaveValue(account.email);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).not.toHaveURL(/\/signin/);
}
