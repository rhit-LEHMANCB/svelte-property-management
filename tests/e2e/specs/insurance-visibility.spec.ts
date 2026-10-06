import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/constants';
import { adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

const user = (firstName: string, lastName: string, extra: Record<string, unknown> = {}) => ({
	email: `${firstName.toLowerCase()}@e2e.test`,
	firstName,
	lastName,
	phoneNumber: '+15555550199',
	permissions: 'user',
	...extra
});

test.describe('renters-insurance: admin visibility', () => {
	test.beforeAll(async () => {
		const db = adminDb();
		await db.doc('users/e2e-insured').set(
			user('Ivy', 'Insured', {
				insurance: {
					companyName: 'Acme Insurance',
					policyNumber: 'P-123',
					startDate: '2026-01-01',
					endDate: '2027-01-01'
				}
			})
		);
		await db.doc('users/e2e-uninsured').set(user('Una', 'Uninsured'));
	});

	test('Scenario: Missing-insurance flag appears only on tenants without a policy', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		const insured = page.getByRole('listitem').filter({ hasText: 'Ivy Insured' });
		const uninsured = page.getByRole('listitem').filter({ hasText: 'Una Uninsured' });
		await expect(uninsured).toBeVisible();
		await expect(uninsured.locator('.badge-icon', { hasText: '!' })).toBeVisible();
		await expect(insured.locator('.badge-icon', { hasText: '!' })).toHaveCount(0);
	});

	test('Scenario: Policy on file shows company, policy number and effective dates', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		await page
			.getByRole('listitem')
			.filter({ hasText: 'Ivy Insured' })
			.getByText('Ivy Insured')
			.click();
		const dialog = page.getByRole('dialog');
		await dialog.getByText('Insurance', { exact: true }).click();

		await expect(dialog.getByText('Company Name: Acme Insurance')).toBeVisible();
		await expect(dialog.getByText('Policy Number: P-123')).toBeVisible();
		await expect(dialog.getByText('Effective from 2026-01-01 to 2027-01-01')).toBeVisible();
	});

	test('Scenario: No policy shows "No insurance info"', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		await page
			.getByRole('listitem')
			.filter({ hasText: 'Una Uninsured' })
			.getByText('Una Uninsured')
			.click();
		const dialog = page.getByRole('dialog');
		await dialog.getByText('Insurance', { exact: true }).click();

		await expect(dialog.getByText('No insurance info')).toBeVisible();
	});
});
