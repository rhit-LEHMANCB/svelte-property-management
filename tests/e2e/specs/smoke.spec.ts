import { expect, test } from '@playwright/test';
import {
	ADMIN,
	FAKE_STRIPE_URL,
	FIRESTORE_EMULATOR,
	PROJECT_ID,
	PROPERTY,
	TENANT
} from '../support/constants';

// Infrastructure smoke: proves the emulators, the seed, the fake Stripe and the app are all up.
const document = async (path: string) => {
	const response = await fetch(
		`http://${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
		{ headers: { Authorization: 'Bearer owner' } }
	);
	return { status: response.status, body: await response.json() };
};

test.describe('end-to-end infrastructure', () => {
	test('the app boots in e2e mode and serves the sign-in page', async ({ page }) => {
		await page.goto('/signin');
		await expect(page.getByText('Please sign in to continue.')).toBeVisible();
	});

	test('the seed created the admin, the tenant, the property and the link', async () => {
		const admin = await document(`users/${ADMIN.uid}`);
		expect(admin.status).toBe(200);
		expect(admin.body.fields.permissions.stringValue).toBe('admin');

		const tenant = await document(`users/${TENANT.uid}`);
		expect(tenant.body.fields.permissions.stringValue).toBe('user');

		const property = await document(`properties/${PROPERTY.id}`);
		expect(property.body.fields.title.stringValue).toBe(PROPERTY.title);

		const link = await document(`junction_user_property/${TENANT.uid}_${PROPERTY.id}`);
		expect(link.body.fields.tenantId.stringValue).toBe(TENANT.uid);
	});

	test('the fake Stripe server is reachable and starts with no recorded requests', async () => {
		await fetch(`${FAKE_STRIPE_URL}/__requests`, { method: 'DELETE' });
		const response = await fetch(`${FAKE_STRIPE_URL}/__requests`);
		expect(await response.json()).toEqual([]);
	});
});
