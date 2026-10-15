import { test, expect, type Page } from '@playwright/test';
import { newSession, shot } from './helpers';

const CAP = 'data-migrations';
let admin: Page;
let tenant: Page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async ({ browser }) => {
	admin = await newSession(browser, 'admin');
	tenant = await newSession(browser, 'tenant');
});
test.afterAll(async () => {
	await admin?.context().close();
	await tenant?.context().close();
});

test.describe('Billing terms on existing leases', () => {
	test('Existing lease', async () => {
		// Read only: the tenant's pre-existing lease (rent $2,000.00) was made before this change.
		await tenant.goto('/');
		await tenant.waitForLoadState('networkidle');
		const card = tenant.getByLabel('Your lease').first();
		await expect(card).toContainText('$100.00 if rent is not paid in full 5 days after it is due');
		await expect(card).not.toContainText('Security deposit');
		await shot(tenant, `${CAP}-existing-lease`);
		test.info().annotations.push({ type: 'partial', description: 'late fee start date and unchanged payment history are not visible in the UI' });
	});
	test('Run again', async () => {
		test.skip(true, 'not verified: migrations cannot be run from the site');
	});
	test('Prorated after the migration', async () => {
		test.skip(true, 'not verified: needs an existing lease that started mid-month with a full month recorded; see lease-billing for the equivalent through a date change');
	});
});
