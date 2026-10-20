import { expect, test, type Page } from '@playwright/test';
import { ADMIN, FAKE_STRIPE_URL, LEASE_ID, PROPERTY, TENANT } from '../support/constants';
import { adminAuth, adminDb, storageFileExists } from '../support/admin';
import { dollarsPattern, nextMonthPayable, signIn } from '../support/helpers';

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
		// page-layout "Warning that stops a save": an alert with the shared notice padding.
		await expect(warning).toHaveAttribute('data-notice', 'warning');
		expect(await warning.evaluate((el) => getComputedStyle(el).paddingTop)).toBe('16px');
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

		const owed = nextMonthPayable() ? 2000 : 1000;
		await expect(
			page.getByText(new RegExp(`You have a balance of ${dollarsPattern(owed)} due on`))
		).toBeVisible();
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

		// With payments the page says so and Delete is disabled; the server refuses it as well.
		await page.goto(`/admin/properties/${LP}/leases/${withPayments.id}`);
		await page.waitForLoadState('networkidle');
		await expect(page.getByText(/Set an end date instead/).first()).toBeVisible();
		await expect(page.getByRole('button', { name: 'Delete lease' })).toBeDisabled();
		const refused = await page.evaluate(
			async (url) => (await fetch(url, { method: 'DELETE' })).status,
			`/api/lease/${withPayments.id}`
		);
		expect(refused).toBe(409);
		expect((await withPayments.ref.get()).exists).toBe(true);

		// Without payments there is no warning and Delete works.
		await page.goto(`/admin/properties/${LP}/leases/${withoutPayments.id}`);
		await page.waitForLoadState('networkidle');
		await expect(page.getByText(/Set an end date instead/)).toHaveCount(0);
		await page.getByRole('button', { name: 'Delete lease' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
		await expect(page).toHaveURL(/\?tab=leases$/);
		expect((await withoutPayments.ref.get()).exists).toBe(false);
	});

	test('Scenario: a lease whose only payment is toward the deposit cannot be deleted either', async ({
		page
	}) => {
		const db = adminDb();
		const property = 'e2e-deposit-only-property';
		await db
			.doc(`properties/${property}`)
			.set(leaseProperty('E2E Deposit Only', '18 Deposit Dr', 900));
		const lease = await db.collection('leases').add({
			propertyId: property,
			tenantIds: [],
			rent: 900,
			startDate: '2040-01-01',
			endDate: null,
			document: null
		});
		await lease.collection('deposit').doc('ledger').set({ paid: 100, transactions: [] });
		await signIn(page, ADMIN);

		await page.goto(`/admin/properties/${property}/leases/${lease.id}`);
		await page.waitForLoadState('networkidle');
		await expect(page.getByText(/Set an end date instead/).first()).toBeVisible();
		await expect(page.getByRole('button', { name: 'Delete lease' })).toBeDisabled();

		await lease.collection('deposit').doc('ledger').delete();
		await lease.delete();
		await db.doc(`properties/${property}`).delete();
	});
});

/** The month name a `YYYY-MM-DD` date falls in, as payment_history keys it. */
const monthName = (date: string) =>
	new Date(`${date}T12:00:00`).toLocaleString('en-US', { month: 'long' });

/** Calls the app from inside the page, with the signed-in user's session. */
const callInPage = (page: Page, method: string, url: string, body?: unknown) =>
	page.evaluate(
		async ({ method, url, body }) => {
			const response = await fetch(url, {
				method,
				headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body)
			});
			return { status: response.status, text: await response.text() };
		},
		{ method, url, body }
	);

const leaseProperty = (title: string, streetAddress: string, rent: number) => ({
	title,
	description: 'Lease test property',
	bedrooms: 2,
	bathrooms: 1,
	squareFeet: 900,
	rent,
	streetAddress,
	apartmentInfo: '',
	city: 'Terre Haute',
	state: 'IN',
	zip: '47803'
});

const seededLease = (
	propertyId: string,
	tenantIds: string[],
	startDate: string,
	endDate: string | null
) => ({
	propertyId,
	tenantIds,
	rent: 1000,
	startDate,
	endDate,
	document: null,
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z'
});

async function seedUser(user: {
	uid: string;
	email: string;
	password?: string;
	firstName: string;
	lastName: string;
}) {
	await adminAuth()
		.deleteUser(user.uid)
		.catch(() => undefined);
	await adminAuth().createUser({ uid: user.uid, email: user.email, password: user.password });
	await adminDb()
		.doc(`users/${user.uid}`)
		.set({
			email: user.email,
			firstName: user.firstName,
			lastName: user.lastName,
			phoneNumber: '+15555550160',
			permissions: 'user',
			stripeID: `cus_${user.uid}`
		});
}

// The form checks, lease statuses, editing rules and the lease document, ported from the add-leases
// QA run. Tests build on each other and run in order.
test.describe.serial('leases: form checks, statuses, edits and documents', () => {
	const LQ = 'e2e-lease-checks-property';
	const TWICE = 'twice@e2e.test';
	const CURRENT = 'current@e2e.test';
	const ADDED = 'added@e2e.test';
	let currentLeaseId = '';

	const currentLease = async () => (await adminDb().doc(`leases/${currentLeaseId}`).get()).data()!;

	async function openNewLease(page: Page) {
		await page.goto(`/admin/properties/${LQ}/leases/new`);
		await page.waitForLoadState('networkidle');
	}

	async function openCurrentLease(page: Page) {
		await page.goto(`/admin/properties/${LQ}/leases/${currentLeaseId}`);
		await page.waitForLoadState('networkidle');
	}

	test.beforeAll(async () => {
		await adminDb()
			.doc(`properties/${LQ}`)
			.set(leaseProperty('E2E Lease Checks', '12 Check St', 1200));
	});

	test('Scenario: Unknown property responds 404', async ({ page }) => {
		await signIn(page, ADMIN);
		const response = await page.goto('/admin/properties/e2e-no-such-property/leases/new');
		expect(response?.status()).toBe(404);
	});

	test('Scenario: Invalid fields: nothing is saved and the form shows the error next to the field', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		const cases = [
			{
				field: 'Monthly rent',
				rent: '0',
				start: '2030-06-01',
				end: '2030-08-31',
				error: 'Rent must be greater than 0'
			},
			{
				field: 'Monthly rent',
				rent: '1200.123',
				start: '2030-06-01',
				end: '2030-08-31',
				error: 'Rent can have at most two decimal places'
			},
			{
				field: 'Start date',
				rent: '1200',
				start: '',
				end: '2030-08-31',
				error: 'Please select a start date'
			},
			{
				field: /^End date/,
				rent: '1200',
				start: '2030-12-01',
				end: '2030-11-01',
				error: 'End date must be after start date'
			}
		];
		for (const c of cases) {
			await openNewLease(page);
			await fillLease(page, {
				rent: c.rent,
				startDate: c.start,
				endDate: c.end,
				emails: ['invalid@e2e.test']
			});
			await page.getByRole('button', { name: 'Save lease' }).click();

			// The message is under the field and is its accessible description.
			await expect(page.getByLabel(c.field)).toHaveAccessibleDescription(c.error);
			await expect(page.getByLabel(c.field)).toHaveAttribute('aria-invalid', 'true');
		}
		expect(await leasesAt(LQ)).toHaveLength(0);
		await expect(adminAuth().getUserByEmail('invalid@e2e.test')).rejects.toBeTruthy();
	});

	test('Scenario: No tenants: nothing is saved and the form says a lease needs a tenant', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await openNewLease(page);
		await fillLease(page, { startDate: '2030-06-01', endDate: '2030-08-31', emails: [''] });
		await page.getByRole('button', { name: 'Save lease' }).click();

		await expect(page.getByText('A lease needs at least one tenant.')).toBeVisible();
		expect(await leasesAt(LQ)).toHaveLength(0);
	});

	test('Scenario: Malformed email: nothing is saved and the form names the entry', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await openNewLease(page);
		await fillLease(page, {
			startDate: '2030-06-01',
			endDate: '2030-08-31',
			emails: ['not-an-email']
		});
		await page.getByRole('button', { name: 'Save lease' }).click();

		await expect(page.getByText('"not-an-email" is not a valid email address')).toBeVisible();
		expect(await leasesAt(LQ)).toHaveLength(0);
	});

	test('Scenario: Same email twice, in any case, is added once', async ({ page }) => {
		await signIn(page, ADMIN);
		await openNewLease(page);
		await fillLease(page, {
			startDate: '2020-01-01',
			endDate: '2020-12-31',
			emails: ['Twice@E2E.test', ` ${TWICE} `]
		});
		await page.getByRole('button', { name: 'Save lease' }).click();

		await expect(page).toHaveURL(new RegExp(`/admin/properties/${LQ}/edit\\?tab=leases$`));
		const [lease] = await leasesAt(LQ);
		const user = await adminAuth().getUserByEmail(TWICE);
		expect(lease.data().tenantIds).toEqual([user.uid]);
		await expect(leaseItems(page).getByRole('list', { name: 'Tenants' }).locator('li')).toHaveCount(
			1
		);
	});

	test('Scenario: Back-to-back leases: a lease starting the day after the last one ends is saved', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await openNewLease(page);
		await fillLease(page, { startDate: '2021-01-01', endDate: '2021-06-30', emails: [TWICE] });
		await page.getByRole('button', { name: 'Save lease' }).click();

		// Saved straight away: no conflict and no overlap warning.
		await expect(page).toHaveURL(new RegExp(`/admin/properties/${LQ}/edit\\?tab=leases$`));
		expect(await leasesAt(LQ)).toHaveLength(2);
	});

	test('Scenario: Upcoming lease, month to month', async ({ page }) => {
		await signIn(page, ADMIN);
		await openNewLease(page);
		await fillLease(page, { startDate: monthStart(), endDate: monthStart(12), emails: [CURRENT] });
		await page.getByRole('button', { name: 'Save lease' }).click();
		await expect(page).toHaveURL(/\?tab=leases$/);
		currentLeaseId = (await leasesAt(LQ)).find((doc) => doc.data().startDate === monthStart())!.id;

		await openNewLease(page);
		await fillLease(page, { startDate: '2040-01-01', emails: ['upcoming@e2e.test'] });
		await page.getByRole('button', { name: 'Save lease' }).click();
		await expect(page).toHaveURL(/\?tab=leases$/);

		const upcoming = leaseItems(page).filter({ hasText: 'upcoming@e2e.test' });
		await expect(upcoming).toContainText('upcoming');
		await expect(upcoming).toContainText('2040-01-01 to month to month');
	});

	test('Scenario: Property with leases: listed newest start first, each with its status', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await openLeasesTab(page, LQ);

		const items = leaseItems(page);
		await expect(items).toHaveCount(4);
		const expected = [
			['upcoming', '2040-01-01 to month to month'],
			['current', `${monthStart()} to ${monthStart(12)}`],
			['ended', '2021-01-01 to 2021-06-30'],
			['ended', '2020-01-01 to 2020-12-31']
		];
		for (const [index, [status, dates]] of expected.entries()) {
			await expect(items.nth(index)).toContainText(status);
			await expect(items.nth(index)).toContainText(dates);
		}
		await expect(items.nth(1)).toContainText('$1,200.00 / month');
	});

	test('Scenario: Wrong type: a text file is refused and nothing is saved', async ({ page }) => {
		await signIn(page, ADMIN);
		await openCurrentLease(page);
		await page.getByLabel(/^Lease document/).setInputFiles({
			name: 'notes.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('not a pdf')
		});
		await page.getByRole('button', { name: 'Save lease' }).click();

		await expect(
			page.getByRole('alert').filter({ hasText: 'The lease document must be a PDF.' })
		).toBeVisible();
		expect((await currentLease()).document).toBeNull();
	});

	test('Scenario: Wrong type: a file named .pdf that is not a PDF is refused', async ({ page }) => {
		await signIn(page, ADMIN);
		await openCurrentLease(page);
		await page.getByLabel(/^Lease document/).setInputFiles({
			name: 'fake.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('this is plain text, not a pdf')
		});
		await page.getByRole('button', { name: 'Save lease' }).click();

		await expect(
			page.getByRole('alert').filter({ hasText: 'The lease document must be a PDF.' })
		).toBeVisible();
		expect((await currentLease()).document).toBeNull();
	});

	const tooLarge = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 + 10, 32)]);

	test('Scenario: Too large: the browser refuses a PDF over 10 MB', async ({ page }) => {
		await signIn(page, ADMIN);
		await openCurrentLease(page);
		const input = page.getByLabel(/^Lease document/);
		await input.setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: tooLarge });

		await expect(page.getByText('The lease document must be 10 MB or smaller.')).toBeVisible();
		expect(await input.evaluate((el: HTMLInputElement) => el.files?.length)).toBe(0);
	});

	test('Scenario: Too large: the server refuses a PDF over 10 MB when the browser check is bypassed', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await openCurrentLease(page);
		// Posted from the page, so the session cookie goes with it, and straight to the form action, so
		// the browser's size check never runs.
		const result = await page.evaluate(
			async ({ url, fields, size }) => {
				const body = new FormData();
				for (const [name, value] of Object.entries(fields)) body.append(name, value);
				const bytes = new Uint8Array(size).fill(32);
				bytes.set(new TextEncoder().encode('%PDF-1.4\n'));
				body.append('document', new File([bytes], 'big.pdf', { type: 'application/pdf' }));
				const response = await fetch(url, {
					method: 'POST',
					headers: { 'x-sveltekit-action': 'true' },
					body
				});
				return response.json();
			},
			{
				url: `/admin/properties/${LQ}/leases/${currentLeaseId}`,
				fields: {
					rent: '1200',
					startDate: monthStart(),
					endDate: monthStart(12),
					emails: CURRENT,
					confirmOverlap: ''
				},
				size: tooLarge.length
			}
		);

		expect(result).toMatchObject({ type: 'failure', status: 400 });
		expect(result.data).toContain('The lease document must be 10 MB or smaller.');
		expect((await currentLease()).document).toBeNull();
	});

	test('Scenario: Attach, then replace: the new PDF replaces the earlier one', async ({ page }) => {
		await signIn(page, ADMIN);
		await openCurrentLease(page);
		await page.getByLabel(/^Lease document/).setInputFiles({
			name: 'first.pdf',
			mimeType: 'application/pdf',
			buffer: PDF
		});
		await page.getByRole('button', { name: 'Save lease' }).click();
		await expect(page).toHaveURL(/\?tab=leases$/);
		const first = (await currentLease()).document;
		expect(first).toMatchObject({ fileName: 'first.pdf' });
		expect(await storageFileExists(first.path)).toBe(true);

		await openCurrentLease(page);
		await expect(page.getByText('Current: first.pdf')).toBeVisible();
		await expect(page.getByRole('link', { name: 'View document' })).toBeVisible();
		const replacement = Buffer.concat([PDF, Buffer.from('% replacement\n')]);
		await page.getByLabel(/^Lease document/).setInputFiles({
			name: 'second.pdf',
			mimeType: 'application/pdf',
			buffer: replacement
		});
		await page.getByRole('button', { name: 'Save lease' }).click();
		await expect(page).toHaveURL(/\?tab=leases$/);

		const second = (await currentLease()).document;
		expect(second).toMatchObject({ fileName: 'second.pdf' });
		expect(second.path).not.toBe(first.path);
		expect(await storageFileExists(first.path)).toBe(false);
		await openCurrentLease(page);
		await expect(page.getByText('Current: second.pdf')).toBeVisible();
		const download = await fetchInPage(page, `/api/lease/${currentLeaseId}/document`);
		expect(download).toEqual({
			status: 200,
			type: 'application/pdf',
			body: replacement.toString('latin1')
		});
	});

	test('Scenario: Lease document link: an admin gets the PDF and an anonymous caller gets 401', async ({
		page,
		request
	}) => {
		const anonymous = await request.get(`/api/lease/${currentLeaseId}/document`, {
			maxRedirects: 0
		});
		expect(anonymous.status()).toBe(401);
		expect(await anonymous.text()).toContain('You must be logged in to do this.');

		await signIn(page, ADMIN);
		const response = await fetchInPage(page, `/api/lease/${currentLeaseId}/document`);
		expect(response.status).toBe(200);
		expect(response.type).toBe('application/pdf');
	});

	test('Scenario: Add a tenant: the new email gets an account, a place on the lease and the welcome email', async ({
		page
	}) => {
		await fetch(`${FAKE_STRIPE_URL}/__emails`, { method: 'DELETE' });
		await signIn(page, ADMIN);
		await openCurrentLease(page);
		await expect(page.getByLabel('Tenant email 1', { exact: true })).toHaveValue(CURRENT);
		await page.getByRole('button', { name: 'Add tenant' }).click();
		await page.getByLabel('Tenant email 2', { exact: true }).fill(ADDED);
		await page.getByRole('button', { name: 'Save lease' }).click();
		await expect(page).toHaveURL(/\?tab=leases$/);

		const added = await adminAuth().getUserByEmail(ADDED);
		const current = await adminAuth().getUserByEmail(CURRENT);
		expect((await currentLease()).tenantIds).toEqual([current.uid, added.uid]);
		await expect(leaseItems(page).filter({ hasText: CURRENT })).toContainText(ADDED);
		const emails = await sentEmails();
		expect(emails.map((e) => e.to)).toEqual([ADDED]);
		expect(emails[0].subject).toBe('Welcome to Lehman Family LLC');
		expect(emails[0].text).toContain('Your lease at 12 Check St, Terre Haute starts on');
	});

	test('Scenario: Remove the last tenant: nothing is saved and the form says a lease needs a tenant', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await openCurrentLease(page);
		await page.getByRole('button', { name: 'Remove tenant email 2' }).click();
		await page.getByRole('button', { name: 'Remove tenant email 1' }).click();
		await page.getByRole('button', { name: 'Save lease' }).click();

		await expect(page.getByText('A lease needs at least one tenant.')).toBeVisible();
		expect((await currentLease()).tenantIds).toHaveLength(2);
	});

	test('Scenario: Admin email on an edit: the same conflict rule applies', async ({ page }) => {
		await signIn(page, ADMIN);
		await openCurrentLease(page);
		await page.getByRole('button', { name: 'Add tenant' }).click();
		await page.getByLabel('Tenant email 3', { exact: true }).fill(ADMIN.email);
		await page.getByRole('button', { name: 'Save lease' }).click();

		await expect(
			page
				.getByRole('alert')
				.filter({ hasText: `${ADMIN.email} belongs to an admin and cannot be a tenant.` })
		).toBeVisible();
		expect((await currentLease()).tenantIds).toHaveLength(2);
	});

	test('Scenario: No payments: deleting the lease removes it and its document', async ({
		page
	}) => {
		const { path } = (await currentLease()).document;
		await signIn(page, ADMIN);
		await openCurrentLease(page);
		await page.getByRole('button', { name: 'Delete lease' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();

		await expect(page).toHaveURL(/\?tab=leases$/);
		await expect(leaseItems(page)).toHaveCount(3);
		expect((await adminDb().doc(`leases/${currentLeaseId}`).get()).exists).toBe(false);
		expect(await storageFileExists(path)).toBe(false);
		// Tenant accounts are kept.
		await expect(adminAuth().getUserByEmail(ADDED)).resolves.toBeTruthy();
	});

	test('Scenario: Deleting a lease that does not exist responds 404', async ({ page }) => {
		await signIn(page, ADMIN);
		const response = await callInPage(page, 'DELETE', '/api/lease/e2e-no-such-lease');
		expect(response.status).toBe(404);
	});
});

test.describe.serial('leases: Change the rent', () => {
	const PROPERTY_ID = 'e2e-rent-change-property';
	const LEASE = 'e2e-rent-change-lease';
	const RENTER = {
		uid: 'e2e-renter',
		email: 'renter@e2e.test',
		password: 'E2e-Renter-Passw0rd',
		firstName: 'Rhea',
		lastName: 'Renter'
	};
	const paidMonth = monthStart(-1);

	test.beforeAll(async () => {
		const db = adminDb();
		await seedUser(RENTER);
		await db
			.doc(`properties/${PROPERTY_ID}`)
			.set(leaseProperty('E2E Rent Change', '14 Rent Rd', 1000));
		await db.doc(`leases/${LEASE}`).set(seededLease(PROPERTY_ID, [RENTER.uid], paidMonth, null));
		// Last month has a payment entry with $100 left; this month has none.
		await db
			.doc(`leases/${LEASE}/payment_history/${paidMonth.slice(0, 4)}`)
			.set({ [monthName(paidMonth)]: { remainingBalance: 100, transactions: [] } });
	});

	test('Scenario: Change the rent: recorded months keep their balance, other months owe the new rent', async ({
		browser
	}) => {
		const tenant = await (await browser.newContext()).newPage();
		await signIn(tenant, RENTER);
		await tenant.goto('/payment');
		// Next month joins the balance in the last week of this one.
		const next = nextMonthPayable() ? 1 : 0;
		await expect(
			tenant.getByText(
				new RegExp(`You have a balance of ${dollarsPattern(1100 + next * 1000)} due on`)
			)
		).toBeVisible();

		const admin = await (await browser.newContext()).newPage();
		await signIn(admin, ADMIN);
		await admin.goto(`/admin/properties/${PROPERTY_ID}/leases/${LEASE}`);
		await admin.waitForLoadState('networkidle');
		await expect(admin.getByText('This lease has recorded payments.')).toBeVisible();
		await admin.getByLabel('Monthly rent').fill('1200');
		await admin.getByRole('button', { name: 'Save lease' }).click();
		await expect(admin).toHaveURL(/\?tab=leases$/);

		await tenant.goto('/payment');
		await expect(
			tenant.getByText(
				new RegExp(`You have a balance of ${dollarsPattern(1300 + next * 1200)} due on`)
			)
		).toBeVisible();
		const history = await adminDb()
			.doc(`leases/${LEASE}/payment_history/${paidMonth.slice(0, 4)}`)
			.get();
		expect(history.data()?.[monthName(paidMonth)].remainingBalance).toBe(100);
	});
});

test.describe.serial('user-management: deleting a user keeps their leases', () => {
	const PROPERTY_ID = 'e2e-user-delete-property';
	const SHARED = 'e2e-user-delete-shared';
	const ALONE = 'e2e-user-delete-alone';
	const LEAVER = {
		uid: 'e2e-leaver',
		email: 'leaver@e2e.test',
		firstName: 'Lee',
		lastName: 'Leaver'
	};
	const STAYER = {
		uid: 'e2e-stayer',
		email: 'stayer@e2e.test',
		firstName: 'Stacy',
		lastName: 'Stayer'
	};

	test.beforeAll(async () => {
		const db = adminDb();
		await seedUser(LEAVER);
		await seedUser(STAYER);
		await db
			.doc(`properties/${PROPERTY_ID}`)
			.set(leaseProperty('E2E User Delete', '16 Gone Ave', 1000));
		await db
			.doc(`leases/${SHARED}`)
			.set(seededLease(PROPERTY_ID, [LEAVER.uid, STAYER.uid], '2030-01-01', '2030-12-31'));
		await db.doc(`leases/${SHARED}/payment_history/2030`).set({ January: { remainingBalance: 0 } });
		await db
			.doc(`leases/${ALONE}`)
			.set(seededLease(PROPERTY_ID, [LEAVER.uid], '2031-01-01', '2031-12-31'));
	});

	test('Scenario: Delete: the user is removed from every lease, and leases and payment history are kept', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');
		await page.getByRole('searchbox', { name: 'Search users' }).fill(LEAVER.email);
		const row = page
			.getByRole('table', { name: 'users' })
			.locator('tbody tr')
			.filter({ hasText: LEAVER.email });
		await row
			.getByRole('button', { name: `Actions for ${LEAVER.firstName} ${LEAVER.lastName}` })
			.click();
		await page.getByRole('menuitem', { name: 'Delete' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();

		await expect
			.poll(async () => (await adminDb().doc(`users/${LEAVER.uid}`).get()).exists)
			.toBe(false);
		await expect(adminAuth().getUser(LEAVER.uid)).rejects.toBeTruthy();
		const shared = await adminDb().doc(`leases/${SHARED}`).get();
		expect(shared.data()?.tenantIds).toEqual([STAYER.uid]);
		expect((await shared.ref.collection('payment_history').doc('2030').get()).exists).toBe(true);

		await openLeasesTab(page, PROPERTY_ID);
		const item = leaseItems(page).filter({ hasText: '2030-01-01' });
		await expect(item).toContainText(STAYER.email);
		await expect(item).not.toContainText(LEAVER.email);
	});

	test('Scenario: Last tenant on a lease: the lease is kept with no tenants', async ({ page }) => {
		const alone = await adminDb().doc(`leases/${ALONE}`).get();
		expect(alone.exists).toBe(true);
		expect(alone.data()?.tenantIds).toEqual([]);

		await signIn(page, ADMIN);
		await openLeasesTab(page, PROPERTY_ID);
		await expect(leaseItems(page).filter({ hasText: '2031-01-01' })).toContainText('No tenants');
	});

	test('Scenario: the edit page of a lease whose tenants are gone shows the form', async ({
		page
	}) => {
		await signIn(page, ADMIN);
		await page.goto(`/admin/properties/${PROPERTY_ID}/leases/${ALONE}`);
		await page.waitForLoadState('networkidle');

		await expect(page.getByLabel('Tenant email 1', { exact: true })).toHaveValue('');
		await expect(page.getByRole('button', { name: 'Save lease' })).toBeVisible();
	});
});

test.describe('access-control: leases are admin-only and private', () => {
	const PROPERTY_ID = 'e2e-access-property';
	const LEASE = 'e2e-access-lease';
	const NEIGHBOR = {
		uid: 'e2e-neighbor',
		email: 'neighbor@e2e.test',
		firstName: 'Nina',
		lastName: 'Neighbor'
	};

	test.beforeAll(async () => {
		const db = adminDb();
		await seedUser(NEIGHBOR);
		await db
			.doc(`properties/${PROPERTY_ID}`)
			.set(leaseProperty('E2E Next Door', '18 Next Door Ct', 1000));
		await db
			.doc(`leases/${LEASE}`)
			.set(seededLease(PROPERTY_ID, [NEIGHBOR.uid], monthStart(), null));
		await fetch(`${FAKE_STRIPE_URL}/__requests`, { method: 'DELETE' });
	});

	test('Scenario: Non-admin calls admin endpoint: a tenant gets 401', async ({ page }) => {
		await signIn(page, TENANT);

		const remove = await callInPage(page, 'DELETE', `/api/lease/${LEASE}`);
		expect(remove.status).toBe(401);
		expect(remove.text).toContain('You must be an admin to do this.');
		const addUser = await callInPage(page, 'POST', '/api/user/add', {
			email: 'not-created@e2e.test'
		});
		expect(addUser.status).toBe(401);
		const form = await page.goto(`/admin/properties/${PROPERTY_ID}/leases/new`);
		expect(form?.status()).toBe(401);

		expect((await adminDb().doc(`leases/${LEASE}`).get()).exists).toBe(true);
		await expect(adminAuth().getUserByEmail('not-created@e2e.test')).rejects.toBeTruthy();
	});

	test('Scenario: Anonymous caller gets 401 "You must be logged in to do this."', async ({
		request
	}) => {
		const remove = await request.delete(`/api/lease/${LEASE}`, { maxRedirects: 0 });
		expect(remove.status()).toBe(401);
		expect(await remove.text()).toContain('You must be logged in to do this.');
		const addUser = await request.post('/api/user/add', {
			data: { email: 'not-created@e2e.test' },
			maxRedirects: 0
		});
		expect(addUser.status()).toBe(401);
		expect(await addUser.text()).toContain('You must be logged in to do this.');

		expect((await adminDb().doc(`leases/${LEASE}`).get()).exists).toBe(true);
	});

	test("Scenario: Another household's lease: its page, document and payment are refused", async ({
		page
	}) => {
		await signIn(page, TENANT);

		const leasePage = await page.goto(`/admin/properties/${PROPERTY_ID}/leases/${LEASE}`);
		expect(leasePage?.status()).toBe(401);
		await expect(page.locator('body')).not.toContainText(NEIGHBOR.email);
		await page.goto('/');
		const document = await callInPage(page, 'GET', `/api/lease/${LEASE}/document`);
		expect(document.status).toBe(403);
		const payment = await callInPage(page, 'POST', '/api/stripe/create-checkout-session/payment', {
			amount: 5,
			leaseId: LEASE,
			method: 'card'
		});
		expect(payment.status).toBe(403);
		expect(payment.text).not.toContain(NEIGHBOR.email);
		expect(await (await fetch(`${FAKE_STRIPE_URL}/__requests`)).json()).toEqual([]);
	});
});
