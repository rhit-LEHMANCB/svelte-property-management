import { test, expect } from '@playwright/test';
import {
	createProperty,
	fillLease,
	leaseIdsAt,
	leaseItems,
	newSession,
	openLeasesTab,
	ready,
	saveLease,
	shot,
	deleteUserByEmail,
	RUN
} from './helpers';

test.setTimeout(170_000);

/**
 * Resend rejects @example.com recipients, so the other specs only exercise the "welcome email fails" path.
 * This one uses Resend's documented sandbox recipient to reach the "welcome email sent" path.
 * The email's content cannot be read from here (see "Not covered by automation").
 */
test('leases: New email with a deliverable address - lease saved with no email warning', async ({ browser }) => {
	const { ctx, page } = await newSession(browser, 'admin');
	const address = `delivered+qa-${RUN}-w1@resend.dev`;
	const prop = await createProperty(page, `qa-Property D ${RUN}`, '950', '404 QA Delta St');
	await page.goto(`/admin/properties/${prop}/leases/new`);
	await ready(page);
	await fillLease(page, { startDate: '2026-12-01', emails: [address] });
	await saveLease(page);
	await expect(page).toHaveURL(/tab=leases/, { timeout: 30000 });
	await ready(page);
	await expect(page.getByText(/welcome emails were not sent/)).toHaveCount(0);
	await expect(leaseItems(page)).toHaveCount(1);
	await expect(leaseItems(page).first()).toContainText('New User');
	await expect(leaseItems(page).first()).toContainText('upcoming', { ignoreCase: true });
	await shot(page, 'leases-new-email-welcome-sent');
	// clean up
	const [leaseId] = await leaseIdsAt(page, prop);
	await page.goto(`/admin/properties/${prop}/leases/${leaseId}`);
	await ready(page);
	await page.getByRole('button', { name: 'Delete lease' }).click();
	await page.getByRole('button', { name: 'Confirm' }).click();
	await expect(page).toHaveURL(/tab=leases/, { timeout: 20000 });
	console.log('sandbox user deleted:', await deleteUserByEmail(page, address));
	await page.goto('/admin/properties');
	await ready(page);
	await page.getByRole('button', { name: /^Actions for qa-Property D/ }).click();
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	await page.getByRole('button', { name: 'Confirm' }).click();
	await page.waitForTimeout(4000);
	await page.goto('/admin/properties');
	await ready(page);
	await expect(page.getByText(/qa-Property D/)).toHaveCount(0);
	await ctx.close();
});
