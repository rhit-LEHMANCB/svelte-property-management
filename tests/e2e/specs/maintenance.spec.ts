import { expect, test } from '@playwright/test';
import { ADMIN, TENANT } from '../support/constants';
import { signIn } from '../support/helpers';

test.describe('maintenance-requests', () => {
	test('Scenario: a tenant submits a request, an admin closes it with a note, and the tenant sees it closed', async ({
		browser
	}) => {
		const subject = `Leaky faucet ${Date.now()}`;
		const description = 'The bathroom faucet drips all night.';
		const workDone = 'Replaced the cartridge and tested for leaks.';

		const tenantContext = await browser.newContext();
		const tenant = await tenantContext.newPage();
		const adminContext = await browser.newContext();
		const admin = await adminContext.newPage();

		// Tenant: Valid submission creates an Open request that is listed straight away.
		await signIn(tenant, TENANT);
		await tenant.goto('/maintenance');
		await tenant.waitForLoadState('networkidle');
		await tenant.getByLabel('Subject').fill(subject);
		await tenant.getByLabel('Description').fill(description);
		await tenant.getByRole('button', { name: 'Add' }).click();
		await expect(tenant.getByText('Successfully added maintenance request.')).toBeVisible();
		const tenantOpen = tenant.getByRole('table', { name: 'open maintenance requests' });
		const tenantRequest = tenantOpen.getByRole('row').filter({ hasText: subject });
		await expect(tenantRequest).toContainText(description);
		// The "Submitted by" column of that request.
		await expect(tenantRequest.getByRole('cell').nth(2)).toHaveText('Tom Tenant');

		// Admin: View lists the request; Close needs a note and moves it to the closed list.
		await signIn(admin, ADMIN);
		await admin.goto('/admin/maintenance');
		await admin.waitForLoadState('networkidle');
		const adminRequest = admin
			.getByRole('table', { name: 'open maintenance requests' })
			.getByRole('row')
			.filter({ hasText: subject });
		await expect(adminRequest).toContainText(description);
		await adminRequest.getByRole('button', { name: `Close request ${subject}` }).click();
		const dialog = admin.getByRole('dialog');
		await dialog.getByRole('textbox').fill(workDone);
		await dialog.getByRole('button', { name: 'Submit' }).click();
		await expect(admin.getByText('Successfully closed request.')).toBeVisible();
		await expect(
			admin
				.getByRole('table', { name: 'closed maintenance requests' })
				.getByRole('row')
				.filter({ hasText: subject })
		).toContainText(workDone);

		// Tenant: the request now shows as closed, with the work done.
		await tenant.goto('/maintenance');
		await tenant.waitForLoadState('networkidle');
		const tenantClosed = tenant
			.getByRole('table', { name: 'closed maintenance requests' })
			.getByRole('row')
			.filter({ hasText: subject });
		// The "Work done" column of that request.
		await expect(tenantClosed.getByRole('cell').nth(3)).toHaveText(workDone);

		await tenantContext.close();
		await adminContext.close();
	});

	test('Scenario: Invalid form keeps an empty subject from being submitted', async ({ page }) => {
		await signIn(page, TENANT);
		await page.goto('/maintenance');
		await page.waitForLoadState('networkidle');

		await page.getByLabel('Description').fill('No subject given');
		await page.getByRole('button', { name: 'Add' }).click();

		// Wait for the app to react (the subject field is flagged invalid) before checking that nothing
		// was submitted, so this cannot pass merely because the page had not responded yet.
		await expect(page.getByLabel('Subject')).toHaveAccessibleDescription(
			'Please provide a subject'
		);
		await expect(page.getByLabel('Subject')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByText('Successfully added maintenance request.')).toHaveCount(0);
		await expect(page.getByLabel('Description')).toHaveValue('No subject given');
	});
});
