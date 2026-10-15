import { expect, type Page } from '@playwright/test';

type Account = { email: string; password: string };

/** Sign in through the real sign-in page and wait until the app has left it. */
export async function signIn(page: Page, account: Account) {
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(account.email);
	await page.getByLabel('Password').fill(account.password);
	// If the page was replaced after filling (a late reload), fail clearly instead of clicking an empty form.
	await expect(page.getByLabel('Email')).toHaveValue(account.email);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).not.toHaveURL(/\/signin/);
}

/**
 * Whether next month's rent is already in the balance: a month becomes payable 7 days before it
 * is due (the 1st), counted in the business time zone like the app. Balances that span "now"
 * depend on it during the last week of a month.
 */
export function nextMonthPayable(now = new Date()) {
	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Indiana/Indianapolis',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
	const [year, month] = today.split('-').map(Number);
	const payableFrom = new Date(Date.UTC(year, month, 1) - 7 * 86_400_000)
		.toISOString()
		.slice(0, 10);
	return today >= payableFrom;
}

/** `1000` -> `\$1,000\.00`, for building balance regexes. */
export const dollarsPattern = (amount: number) =>
	amount
		.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
		.replace(/[$.]/g, (c) => `\\${c}`);
