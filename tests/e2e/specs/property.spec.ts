import { expect, test } from '@playwright/test';
import { ADMIN, FIRESTORE_EMULATOR, PROJECT_ID } from '../support/constants';
import { signIn } from '../support/helpers';

const findProperty = async (title: string) => {
	const response = await fetch(
		`http://${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
		{
			method: 'POST',
			headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' },
			body: JSON.stringify({
				structuredQuery: {
					from: [{ collectionId: 'properties' }],
					where: {
						fieldFilter: {
							field: { fieldPath: 'title' },
							op: 'EQUAL',
							value: { stringValue: title }
						}
					}
				}
			})
		}
	);
	const rows = (await response.json()) as { document?: { fields: Record<string, any> } }[]; // eslint-disable-line @typescript-eslint/no-explicit-any
	return rows.find((row) => row.document)?.document?.fields;
};

test.describe('property-management', () => {
	test('Scenario: an admin creates a property and finds it in the list', async ({ page }) => {
		// The form loads Google Maps for address lookup; nothing in e2e may reach the network.
		await page.route('**/maps.googleapis.com/**', (route) => route.abort());
		const title = `Birch Lane ${Date.now()}`;

		await signIn(page, ADMIN);
		await page.goto('/admin/properties');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Add Property' }).click();
		await expect(page).toHaveURL(/\/admin\/properties\/add$/);
		await page.waitForLoadState('networkidle');

		await page.getByTitle('Title', { exact: true }).fill(title);
		await page.getByTitle('Rent').fill('1450');
		await page.getByTitle('Description').fill('Bright two bedroom with a garden.');
		await page.getByTitle('Bedrooms').fill('2');
		await page.getByTitle('Bathrooms').fill('1.5');
		await page.getByTitle('Square Feet').fill('950');
		await page.getByTitle('Street Address').fill('12 Birch Lane');
		await page.getByTitle('City').fill('Terre Haute');
		await page.getByTitle('State').fill('IN');
		await page.getByTitle('Zip Code').fill('47803');
		await page.getByRole('button', { name: 'Save' }).click();

		// Valid property: created, and the browser lands on its edit page.
		await expect(page.getByText('Successfully created property')).toBeVisible();
		await expect(page).toHaveURL(/\/admin\/properties\/[^/]+\/edit$/);

		await expect.poll(async () => (await findProperty(title))?.rent?.integerValue).toBe('1450');
		const stored = await findProperty(title);
		expect(stored?.city?.stringValue).toBe('Terre Haute');
		expect(stored?.state?.stringValue).toBe('IN');
		expect(stored?.bathrooms?.doubleValue).toBe(1.5);

		// Property directory: the new property is listed.
		await page.goto('/admin/properties');
		await expect(page.getByText(title)).toBeVisible();
	});

	test('Scenario: Invalid property (bad zip code) is not created', async ({ page }) => {
		await page.route('**/maps.googleapis.com/**', (route) => route.abort());
		const title = `Bad Zip ${Date.now()}`;

		await signIn(page, ADMIN);
		await page.goto('/admin/properties/add');
		await page.waitForLoadState('networkidle');
		await page.getByTitle('Title', { exact: true }).fill(title);
		await page.getByTitle('Rent').fill('1000');
		await page.getByTitle('Description').fill('x');
		await page.getByTitle('Bedrooms').fill('1');
		await page.getByTitle('Bathrooms').fill('1');
		await page.getByTitle('Square Feet').fill('500');
		await page.getByTitle('Street Address').fill('1 Test St');
		await page.getByTitle('City').fill('Terre Haute');
		await page.getByTitle('State').fill('IN');
		await page.getByTitle('Zip Code').fill('abc');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect(page).toHaveURL(/\/admin\/properties\/add$/);
		await expect(page.getByText('Successfully created property')).toHaveCount(0);
		expect(await findProperty(title)).toBeUndefined();
	});
});
