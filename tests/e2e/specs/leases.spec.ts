import { expect, test, type Page } from '@playwright/test';
import { ADMIN, FAKE_STRIPE_URL, LEASE_ID, PROPERTY, TENANT } from '../support/constants';
import { adminAuth, adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

// leases: the admin lease pages, tenants added by email, the private document and the tenant's
// lease card, against the emulators. Tests in this file build on each other and run in order.
const LP = 'e2e-lease-property';
const LUCY = {
	uid: 'e2e-lucy',
	email: 'lucy@e2e.test',
	password: 'E2e-Lucy-Passw0rd',
	firstName: 'Lucy',
	lastName: 'Lessee'
};
const NEW_EMAIL = 'new-person@e2e.test';
const PDF = Buffer.from('%PDF-1.4\n% e2e lease document\n%%EOF\n');

/** The first day of this month (or `offset` months later), as YYYY-MM-DD, in local time. */
const monthStart = (offset = 0) => {
	const now = new Date();
	const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

type SentEmail = { to: string | string[]; subject: string; text: string };
const sentEmails = async () =>
	(await (await fetch(`${FAKE_STRIPE_URL}/__emails`)).json()) as SentEmail[];

const leasesAt = async (propertyId: string) =>
	(await adminDb().collection('leases').where('propertyId', '==', propertyId).get()).docs;

/** Fetches a URL from inside the page, with the signed-in user's session. */
const fetchInPage = (page: Page, url: string) =>
	page.evaluate(async (href) => {
		const response = await fetch(href);
		const bytes = new Uint8Array(await response.arrayBuffer());
		return {
			status: response.status,
			type: response.headers.get('content-type'),
			body: response.ok ? String.fromCharCode(...bytes) : undefined
		};
	}, url);

/** The lease rows of the Leases tab (each row also holds a list of its tenants). */
const leaseItems = (page: Page) =>
	page.getByRole('list', { name: 'Leases' }).locator(':scope > li');

async function openLeasesTab(page: Page, propertyId: string) {
	await page.goto(`/admin/properties/${propertyId}/edit?tab=leases`);
	await page.waitForLoadState('networkidle');
}

async function fillLease(
	page: Page,
	lease: { startDate: string; endDate?: string; emails: string[]; rent?: string }
) {
	if (lease.rent) await page.getByLabel('Monthly rent').fill(lease.rent);
	await page.getByLabel('Start date').fill(lease.startDate);
	await page.getByLabel(/^End date/).fill(lease.endDate ?? '');
	for (const [index, email] of lease.emails.entries()) {
		if (index > 0) await page.getByRole('button', { name: 'Add tenant' }).click();
		await page.getByLabel(`Tenant email ${index + 1}`, { exact: true }).fill(email);
	}
}

test.describe.serial('leases', () => {
	test.beforeAll(async () => {
		const db = adminDb();
		await db.doc(`properties/${LP}`).set({
			title: 'E2E Lease House',
			description: 'Lease test property',
			bedrooms: 3,
			bathrooms: 2,
			squareFeet: 1400,
			rent: 1500,
			streetAddress: '7 Lease Ln',
			apartmentInfo: '',
			city: 'Terre Haute',
			state: 'IN',
			zip: '47803'
		});
		await adminAuth()
			.createUser({ uid: LUCY.uid, email: LUCY.email, password: LUCY.password })
			.catch(() => undefined);
		await db.doc(`users/${LUCY.uid}`).set({
			email: LUCY.email,
			firstName: LUCY.firstName,
			lastName: LUCY.lastName,
			phoneNumber: '+15555550150',
			permissions: 'user',
			stripeID: 'cus_lucy'
		});
		await fetch(`${FAKE_STRIPE_URL}/__emails`, { method: 'DELETE' });
	});

	test('Scenario: Property with leases: the migrated lease is listed as current with its tenant', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await openLeasesTab(page, PROPERTY.id);

		const item = leaseItems(page).filter({ hasText: TENANT.email });
		await expect(item).toContainText('current');
		await expect(item).toContainText('$1,000.00 / month');
		await expect(item).toContainText(`${TENANT.firstName} ${TENANT.lastName}`);
	});

	test('Scenario: Create a lease with an existing tenant, a new email and a PDF', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await openLeasesTab(page, LP);
		await expect(page.getByText('No leases', { exact: true })).toBeVisible();
		await page.getByRole('link', { name: 'New lease' }).click();
		await page.waitForLoadState('networkidle');

		// Prefilled rent comes from the property.
		await expect(page.getByLabel('Monthly rent')).toHaveValue('1500');
		await fillLease(page, { startDate: monthStart(), emails: [LUCY.email, NEW_EMAIL] });
		await page.getByLabel(/^Lease document/).setInputFiles({
			name: 'signed-lease.pdf',
			mimeType: 'application/pdf',
			buffer: PDF
		});
		await page.getByRole('button', { name: 'Save lease' }).click();

		await expect(page).toHaveURL(new RegExp(`/admin/properties/${LP}/edit\\?tab=leases$`));
		const item = leaseItems(page);
		await expect(item).toHaveCount(1);
		await expect(item).toContainText(LUCY.email);
		await expect(item).toContainText(NEW_EMAIL);
		await expect(item).toContainText('month to month');

		const [lease] = await leasesAt(LP);
		expect(lease.data()).toMatchObject({ rent: 1500, startDate: monthStart(), endDate: null });
		expect(lease.data().document).toMatchObject({ fileName: 'signed-lease.pdf' });
		const newUser = await adminAuth().getUserByEmail(NEW_EMAIL);
		expect(lease.data().tenantIds).toEqual([LUCY.uid, newUser.uid]);

		// Only the new address gets a welcome email, and it names the property and start date.
		const emails = await sentEmails();
		expect(emails.map((e) => e.to)).toEqual([NEW_EMAIL]);
		expect(emails[0].subject).toBe('Welcome to Lehman Family LLC');
		expect(emails[0].text).toContain('Your lease at 7 Lease Ln, Terre Haute starts on');
	});

	test('Scenario: Overlap warning, then Save anyway', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto(`/admin/properties/${LP}/leases/new`);
		await page.waitForLoadState('networkidle');

		await fillLease(page, { startDate: monthStart(1), emails: ['second-household@e2e.test'] });
		await page.getByRole('button', { name: 'Save lease' }).click();

		const warning = page
			.getByRole('alert')
			.filter({ hasText: 'These dates overlap another lease at this property' });
		await expect(warning).toContainText(`${monthStart()} to month to month`);
		expect(await leasesAt(LP)).toHaveLength(1);

		await warning.getByRole('button', { name: 'Save anyway' }).click();
		await expect(page).toHaveURL(new RegExp(`/admin/properties/${LP}/edit\\?tab=leases$`));
		expect(await leasesAt(LP)).toHaveLength(2);
	});

	test('Scenario: Welcome email fails: the lease is saved and the admin is told which address', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await page.goto(`/admin/properties/${LP}/leases/new`);
		await page.waitForLoadState('networkidle');
		await fetch(`${FAKE_STRIPE_URL}/__emails/fail-next`, { method: 'POST' });

		await fillLease(page, {
			startDate: '2040-01-01',
			endDate: '2040-12-31',
			emails: ['no-mail@e2e.test']
		});
		await page.getByRole('button', { name: 'Save lease' }).click();
		// The month-to-month leases above run forever, so this one overlaps them too.
		await page.getByRole('button', { name: 'Save anyway' }).click();

		const notice = page
			.getByRole('alert')
			.filter({ hasText: 'The lease was saved, but these welcome emails were not sent' });
		await expect(notice).toContainText('no-mail@e2e.test');
		await expect(notice).toContainText('Forgot password');
		expect(await leasesAt(LP)).toHaveLength(3);
	});

	test('Scenario: Edit a lease: change the rent and remove a tenant', async ({ page }) => {
		await signIn(page, ADMIN);
		await openLeasesTab(page, LP);
		const first = leaseItems(page).filter({ hasText: LUCY.email });
		await first.getByRole('link', { name: /^Edit lease/ }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByLabel('Tenant email 1', { exact: true })).toHaveValue(LUCY.email);
		await page.getByLabel('Monthly rent').fill('1550');
		await page.getByRole('button', { name: 'Remove tenant email 2' }).click();
		await page.getByRole('button', { name: 'Save lease' }).click();
		// Editing checks overlaps like creating does; the other leases here overlap this one.
		await page.getByRole('button', { name: 'Save anyway' }).click();

		await expect(page).toHaveURL(/\?tab=leases$/);
		const lease = (await leasesAt(LP)).find((doc) => doc.data().tenantIds.includes(LUCY.uid))!;
		expect(lease.data()).toMatchObject({ rent: 1550, tenantIds: [LUCY.uid] });
		// The removed tenant keeps their account.
		await expect(adminAuth().getUserByEmail(NEW_EMAIL)).resolves.toBeTruthy();
	});

	test('Scenario: Tenant lease card shows the lease and opens the document', async ({ page }) => {
		await signIn(page, LUCY);
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		const card = page.getByRole('region', { name: 'Your lease' });
		await expect(card).toContainText('7 Lease Ln, Terre Haute');
		await expect(card).toContainText('current');
		await expect(card).toContainText('month to month');
		await expect(card).toContainText('$1,550.00');

		const link = card.getByRole('link', { name: 'View lease document' });
		const download = await fetchInPage(page, (await link.getAttribute('href'))!);
		expect(download).toEqual({
			status: 200,
			type: 'application/pdf',
			body: PDF.toString('latin1')
		});
	});

	test('Scenario: Other tenant cannot open the document (403)', async ({ page }) => {
		const lease = (await leasesAt(LP)).find((doc) => doc.data().tenantIds.includes(LUCY.uid))!;
		await signIn(page, TENANT);

		await page.goto('/');
		const response = await fetchInPage(page, `/api/lease/${lease.id}/document`);
		expect(response.status).toBe(403);
	});

	test('Scenario: the migrated tenant sees the same balance on /payment as before leases', async ({
		page
	}) => {
		await signIn(page, TENANT);
		await page.goto('/payment');
		await page.waitForLoadState('networkidle');

		await expect(page.getByText(/You have a balance of \$1,000\.00 due on/)).toBeVisible();
		expect((await adminDb().doc(`leases/${LEASE_ID}`).get()).exists).toBe(true);
	});

	test('Scenario: Delete a lease: refused with payments, removed without', async ({ page }) => {
		const leases = await leasesAt(LP);
		const withPayments = leases.find((doc) => doc.data().startDate === monthStart(1))!;
		const withoutPayments = leases.find((doc) => doc.data().startDate === '2040-01-01')!;
		await withPayments.ref
			.collection('payment_history')
			.doc(monthStart(1).slice(0, 4))
			.set({ January: { remainingBalance: 0 } });
		await signIn(page, ADMIN);

		await page.goto(`/admin/properties/${LP}/leases/${withPayments.id}`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Delete lease' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
		await expect(page.getByText(/Set an end date instead/).first()).toBeVisible();
		expect((await withPayments.ref.get()).exists).toBe(true);

		await page.goto(`/admin/properties/${LP}/leases/${withoutPayments.id}`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Delete lease' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
		await expect(page).toHaveURL(/\?tab=leases$/);
		expect((await withoutPayments.ref.get()).exists).toBe(false);
	});
});
