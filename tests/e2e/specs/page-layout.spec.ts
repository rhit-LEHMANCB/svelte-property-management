import { expect, test, type Locator, type Page } from '@playwright/test';
import { ADMIN, LEASE_ID, PROPERTY, TENANT } from '../support/constants';
import { adminDb } from '../support/admin';
import { signIn } from '../support/helpers';

// page-layout: one width, card, auth card, notice, action row, breadcrumbs and field-error style.

const ADMIN_PAGES = [
	'/admin',
	'/admin/users',
	'/admin/properties',
	'/admin/maintenance',
	'/admin/properties/add',
	`/admin/properties/${PROPERTY.id}/edit`,
	`/admin/properties/${PROPERTY.id}/leases/new`,
	`/admin/properties/${PROPERTY.id}/leases/${LEASE_ID}`,
	'/profile'
];
const TENANT_PAGES = [
	'/',
	'/maintenance',
	'/payment',
	'/payment/success',
	'/profile',
	'/insurance'
];

async function open(page: Page, path: string) {
	await page.goto(path);
	await page.waitForLoadState('networkidle');
}

const box = async (locator: Locator) => {
	const result = await locator.boundingBox();
	if (!result) throw new Error('element is not visible');
	return result;
};

/** Content width and its gaps to the left and right edges of the main area. */
async function bodyPlacement(page: Page) {
	const main = await box(page.locator('main'));
	const body = await box(page.locator('[data-page-body]'));
	return {
		width: body.width,
		left: body.x - main.x,
		right: main.x + main.width - (body.x + body.width)
	};
}

/** How far the page or its scrolling main area can scroll sideways. */
const sidewaysOverflow = (page: Page) =>
	page.evaluate(() =>
		Math.max(
			...[document.scrollingElement, document.querySelector('main')]
				.filter((el): el is Element => !!el)
				.map((el) => el.scrollWidth - el.clientWidth)
		)
	);

test.describe('page-layout: signed-in pages share one centered width', () => {
	test.describe.configure({ timeout: 120_000 });

	test('Scenario: Wide screen', async ({ page }) => {
		await page.setViewportSize({ width: 1600, height: 900 });
		await signIn(page, ADMIN);
		for (const path of ADMIN_PAGES) {
			await open(page, path);
			const placement = await bodyPlacement(page);
			expect(placement.width, path).toBeLessThanOrEqual(1024);
			expect(Math.abs(placement.left - placement.right), path).toBeLessThanOrEqual(1);
		}
		await page.context().clearCookies();
		await signIn(page, TENANT);
		for (const path of TENANT_PAGES) {
			await open(page, path);
			const placement = await bodyPlacement(page);
			expect(placement.width, path).toBeLessThanOrEqual(1024);
			expect(Math.abs(placement.left - placement.right), path).toBeLessThanOrEqual(1);
		}
	});

	test('Scenario: List and form pages match', async ({ page }) => {
		await page.setViewportSize({ width: 1600, height: 900 });
		await signIn(page, ADMIN);
		await open(page, '/admin/users');
		const users = await box(page.locator('[data-page-body]'));
		await open(page, '/profile');
		const profile = await box(page.locator('[data-page-body]'));
		expect(profile.x).toBe(users.x);
		expect(profile.width).toBe(users.width);
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`Scenario: Phone width (${colorScheme})`, async ({ browser }) => {
			const context = await browser.newContext({
				colorScheme,
				viewport: { width: 360, height: 740 }
			});
			const page = await context.newPage();
			await signIn(page, ADMIN);
			for (const path of ADMIN_PAGES) {
				await open(page, path);
				expect(await sidewaysOverflow(page), path).toBeLessThanOrEqual(0);
			}
			await context.clearCookies();
			await signIn(page, TENANT);
			for (const path of TENANT_PAGES) {
				await open(page, path);
				expect(await sidewaysOverflow(page), path).toBeLessThanOrEqual(0);
			}
			await context.close();
		});
	}
});

test.describe('page-layout: cards share one padding and hold their section heading', () => {
	const padding = (locator: Locator) =>
		locator.evaluate((el) => {
			const style = getComputedStyle(el);
			return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
		});
	const SHARED = ['24px', '24px', '24px', '24px'];

	test('Scenario: Two pages’ cards', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await signIn(page, TENANT);
		for (const [path, heading] of [
			['/profile', 'Contact Info'],
			['/maintenance', 'Add Maintenance Request']
		]) {
			await open(page, path);
			const card = page.locator('[data-card]').filter({
				has: page.getByRole('heading', { name: heading })
			});
			expect(await padding(card), path).toEqual(SHARED);
			// The heading is inside the card, in its first child.
			await expect(
				card.locator('> :first-child').getByRole('heading', { name: heading })
			).toBeVisible();
		}
	});

	test('Scenario: Dashboard and admin home', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await signIn(page, TENANT);
		await open(page, '/');
		expect(await padding(page.getByRole('region', { name: 'Your lease' }).first())).toEqual(SHARED);
		await page.context().clearCookies();
		await signIn(page, ADMIN);
		await open(page, '/admin');
		expect(await padding(page.locator('[data-card]').first())).toEqual(SHARED);
	});
});

test.describe('page-layout: auth pages share one card', () => {
	test('Scenario: Compare auth pages', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		const measure = async (path: string) => {
			await open(page, path);
			const card = page.locator('[data-auth-card]');
			const cardBox = await box(card);
			const style = await card.evaluate((el) => getComputedStyle(el).padding);
			const button = page.locator('[data-auth-card] [data-form-actions] button').first();
			const lastField = page.locator('[data-auth-card] [data-field]').last();
			const gap =
				(await box(button)).y - ((await box(lastField)).y + (await box(lastField)).height);
			const buttonWidth = (await box(button)).width;
			return { width: cardBox.width, style, gap, buttonWidth };
		};
		const signin = await measure('/signin');
		const forgot = await measure('/forgot');
		const reset = await measure('/reset?mode=resetPassword&oobCode=layout-check');
		for (const other of [forgot, reset]) {
			expect(other.width).toBe(signin.width);
			expect(other.style).toBe(signin.style);
			expect(other.gap).toBeCloseTo(signin.gap, 0);
			expect(other.buttonWidth).toBe(signin.buttonWidth);
		}
	});
});

test.describe('page-layout: notices share one style', () => {
	test('Scenario: Form error notice', async ({ page }) => {
		await open(page, '/signin');
		await page.getByLabel('Email').fill(TENANT.email);
		await page.getByLabel('Password').fill('not-the-password');
		await page.getByRole('button', { name: 'Sign in' }).click();

		const notice = page.locator('[data-notice="error"]');
		await expect(notice).toHaveText('Your email or password is incorrect.');
		await expect(notice).toHaveAttribute('role', 'alert');
		expect(await notice.evaluate((el) => getComputedStyle(el).paddingTop)).toBe('16px');
		// Above the submit button, and not attached to either field.
		expect((await box(notice)).y).toBeLessThan(
			(await box(page.getByRole('button', { name: 'Sign in' }))).y
		);
		await expect(page.getByLabel('Email')).not.toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByLabel('Password')).not.toHaveAttribute('aria-invalid', 'true');
	});
});

test.describe('page-layout: forms end with one action row', () => {
	test('Scenario: Form submits match', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await signIn(page, ADMIN);
		const pages: [string, string][] = [
			['/profile', 'Save'],
			[`/admin/properties/${PROPERTY.id}/edit`, 'Save'],
			[`/admin/properties/${PROPERTY.id}/leases/new`, 'Save lease']
		];
		const heights: number[] = [];
		for (const [path, name] of pages) {
			await open(page, path);
			const submit = page.getByRole('button', { name, exact: true }).first();
			await expect(submit.locator('xpath=ancestor::*[@data-form-actions]'), path).toHaveCount(1);
			await expect(submit, path).not.toHaveClass(/btn-sm/);
			heights.push((await box(submit)).height);
		}
		expect(new Set(heights).size).toBe(1);
	});

	test('Scenario: Row actions', async ({ page }) => {
		await adminDb()
			.doc('maintenance/e2e-layout-open')
			.set({
				subject: 'Layout row action',
				description: 'Seeded so the open list has a row',
				status: 'Open',
				propertyId: PROPERTY.id,
				propertyAddress: `${PROPERTY.streetAddress}, ${PROPERTY.city}, ${PROPERTY.state}`,
				submitter: `${TENANT.firstName} ${TENANT.lastName}`,
				dateAdded: new Date('2026-01-01T12:00:00Z')
			});
		try {
			await signIn(page, ADMIN);
			await open(page, '/admin/maintenance');
			const row = page
				.getByRole('table', { name: 'open maintenance requests' })
				.getByRole('row')
				.filter({ hasText: 'Layout row action' });
			await expect(row.getByRole('button', { name: /Close/ })).toHaveClass(/btn-sm/);
		} finally {
			await adminDb().doc('maintenance/e2e-layout-open').delete();
		}
	});
});

test.describe('page-layout: nested pages show breadcrumbs', () => {
	const trail = (page: Page) => page.getByRole('navigation', { name: 'Breadcrumb' });

	test('Scenario: Edit lease', async ({ page }) => {
		await signIn(page, ADMIN);
		await open(page, `/admin/properties/${PROPERTY.id}/leases/${LEASE_ID}`);
		await expect(trail(page).getByRole('listitem')).toHaveText([
			'Properties',
			PROPERTY.title,
			'Edit lease'
		]);
		await expect(trail(page).locator('[aria-current="page"]')).toHaveText('Edit lease');

		await trail(page).getByRole('link', { name: PROPERTY.title }).click();
		await expect(page).toHaveURL(new RegExp(`/admin/properties/${PROPERTY.id}/edit`));
		await expect(trail(page).getByRole('listitem')).toHaveText(['Properties', PROPERTY.title]);

		await trail(page).getByRole('link', { name: 'Properties' }).click();
		await expect(page).toHaveURL(/\/admin\/properties$/);
	});

	test('Scenario: Other nested pages', async ({ page }) => {
		await signIn(page, ADMIN);
		await open(page, '/admin/properties/add');
		await expect(trail(page).getByRole('listitem')).toHaveText(['Properties', 'New property']);
		await open(page, `/admin/properties/${PROPERTY.id}/leases/new`);
		await expect(trail(page).getByRole('listitem')).toHaveText([
			'Properties',
			PROPERTY.title,
			'New lease'
		]);
		await page.context().clearCookies();
		await signIn(page, TENANT);
		await open(page, '/payment/success');
		await expect(trail(page).getByRole('listitem')).toHaveText(['Payment', 'Success']);
		await trail(page).getByRole('link', { name: 'Payment' }).click();
		await expect(page).toHaveURL(/\/payment$/);
	});

	test('Scenario: Top-level page', async ({ page }) => {
		await signIn(page, TENANT);
		for (const path of ['/', '/profile', '/payment', '/maintenance', '/insurance']) {
			await open(page, path);
			await expect(trail(page), path).toHaveCount(0);
		}
		await page.context().clearCookies();
		await signIn(page, ADMIN);
		for (const path of ['/admin', '/admin/users', '/admin/properties', '/admin/maintenance']) {
			await open(page, path);
			await expect(trail(page), path).toHaveCount(0);
		}
	});

	test('Scenario: Long title on a phone', async ({ page }) => {
		const id = 'e2e-layout-long-title';
		const title = 'A very long property title that keeps going past sixty chars';
		const seeded = (await adminDb().doc(`properties/${PROPERTY.id}`).get()).data();
		await adminDb()
			.doc(`properties/${id}`)
			.set({ ...seeded, title });
		try {
			await page.setViewportSize({ width: 360, height: 740 });
			await signIn(page, ADMIN);
			await open(page, `/admin/properties/${id}/leases/new`);
			const crumb = trail(page).getByRole('link', { name: title });
			await expect(crumb).toBeVisible();
			expect(await crumb.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
			expect(await crumb.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
			expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
		} finally {
			await adminDb().doc(`properties/${id}`).delete();
		}
	});
});

test.describe('page-layout: field errors show under each field', () => {
	/** The control's error message: linked through aria-describedby and placed right below it. */
	async function expectFieldError(control: Locator, message: string | RegExp) {
		await expect(control).toHaveAttribute('aria-invalid', 'true');
		await expect(control).toHaveClass(/input-error/);
		await expect(control).toHaveAccessibleDescription(message);
		const error = control
			.locator('xpath=ancestor::*[@data-field][1]')
			.locator('[data-field-error]');
		await expect(error).toHaveText(message);
		expect((await box(error)).y).toBeGreaterThan((await box(control)).y);
	}

	test('Scenario: Missing required field, then fixing it', async ({ page }) => {
		await signIn(page, TENANT);
		await open(page, '/profile');
		const firstName = page.getByLabel('First Name');
		await expect(firstName).not.toHaveAttribute('aria-invalid', 'true');
		await firstName.fill('');
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expectFieldError(firstName, 'Please provide a first name');
		// The field errors say it all: no generic "Invalid form" message as well.
		await expect(page.getByText('Invalid form')).toHaveCount(0);
		// The error outline is a different ring color, also while the field has focus.
		const ring = () => firstName.evaluate((el) => getComputedStyle(el).boxShadow);
		await firstName.focus();
		const invalidRing = await ring();
		const lastName = page.getByLabel('Last Name');
		await lastName.focus();
		expect(invalidRing).not.toBe(await lastName.evaluate((el) => getComputedStyle(el).boxShadow));

		await firstName.fill(TENANT.firstName);
		await expect(firstName).not.toHaveAttribute('aria-invalid', 'true');
		await expect(firstName).not.toHaveClass(/input-error/);
		await expect(page.locator('[data-field-error]')).toHaveCount(0);
	});

	test('Scenario: Untouched form, then a missing rent', async ({ page }) => {
		await signIn(page, ADMIN);
		await open(page, `/admin/properties/${PROPERTY.id}/leases/new`);
		const rent = page.getByLabel('Monthly rent');
		// Typing and leaving fields does not show errors before the first submit.
		await rent.fill('');
		await page.getByLabel('Start date').focus();
		await page.getByLabel('Grace days').focus();
		await expect(page.locator('[data-field-error]')).toHaveCount(0);
		await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);

		await page.getByRole('button', { name: 'Save lease' }).click();
		await expectFieldError(rent, /rent/i);
	});

	test('Scenario: Focus an invalid field (Insurance)', async ({ page }) => {
		await signIn(page, TENANT);
		await open(page, '/insurance');
		const policy = page.getByLabel('Policy Number');
		await policy.fill('');
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expectFieldError(policy, 'Please provide your policy number');
		await policy.fill('P-123');
		await expect(policy).not.toHaveAttribute('aria-describedby');
	});

	test('Scenario: Dialog field (Add user)', async ({ page }) => {
		await signIn(page, ADMIN);
		await open(page, '/admin/users');
		await page.getByRole('button', { name: 'Add User' }).click();
		const dialog = page.getByRole('dialog');
		const email = dialog.getByLabel('Enter User Email');
		await email.fill('not-an-email');
		await dialog.getByRole('button', { name: 'Submit' }).click();
		await expect(dialog).toBeVisible();
		await expectFieldError(email, 'Please enter a valid email.');
		await expect(email).toBeFocused();
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog).toHaveCount(0);
	});

	test('Scenario: Without scripts', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/forgot');
		// The browser's own email check would stop the post; the server check is what is tested.
		await page.locator('form').evaluate((form) => form.setAttribute('novalidate', ''));
		await page.getByLabel('Email').fill('not-an-email');
		await page.getByRole('button', { name: 'Send reset link' }).click();
		await expectFieldError(page.getByLabel('Email'), 'Please enter a valid email.');
		await context.close();
	});
});
