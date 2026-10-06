import { test, expect, type Locator, type Page } from '@playwright/test';

const SHOTS = 'openspec/changes/add-test-suite/qa/screenshots';
const SUBJECT = `qa-regression-${Date.now()}`;
test.describe.configure({ mode: 'serial' });

// This repository is public, so screenshots must not show personal data. Before each one, any element
// whose own text or input value contains an email address, a phone number or a real person's first name
// is tagged, and Playwright blacks it out. The tags are removed again, so the page itself is unchanged.
async function markSensitive(page: Page, scope = 'body') {
	await page.evaluate((scopeSelector) => {
		const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/;
		const phone = /(?<!\d)\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;
		const person = /\bcaleb\b/i;
		const hit = (text: string) => email.test(text) || phone.test(text) || person.test(text);
		for (const el of Array.from(document.querySelectorAll<HTMLElement>(`${scopeSelector} *`))) {
			const own = Array.from(el.childNodes)
				.filter((node) => node.nodeType === Node.TEXT_NODE)
				.map((node) => node.textContent ?? '')
				.join(' ');
			const value = (el as HTMLInputElement).value;
			if (hit(own) || (typeof value === 'string' && hit(value)))
				el.setAttribute('data-qa-mask', '1');
		}
	}, scope);
}
async function shot(
	page: Page,
	name: string,
	options: {
		clip?: { x: number; y: number; width: number; height: number };
		extraMask?: Locator[];
		scope?: string;
	} = {}
) {
	await markSensitive(page, options.scope);
	try {
		await page.screenshot({
			path: `${SHOTS}/${name}.png`,
			type: 'png',
			animations: 'disabled',
			clip: options.clip,
			mask: [page.locator('[data-qa-mask]'), ...(options.extraMask ?? [])],
			maskColor: '#000000'
		});
	} finally {
		await page.evaluate(() =>
			document
				.querySelectorAll('[data-qa-mask]')
				.forEach((el) => el.removeAttribute('data-qa-mask'))
		);
	}
}
async function signIn(page: Page, who: 'ADMIN' | 'TENANT') {
	await page.goto('/signin');
	await page.waitForLoadState('networkidle'); // let the page hydrate so filled values are not reset
	const email = page.getByTitle('Email');
	await email.fill(process.env[`QA_${who}_EMAIL`]!);
	await page.getByTitle('Password').fill(process.env[`QA_${who}_PASSWORD`]!);
	await expect(email).not.toHaveValue('');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL((u) => !u.pathname.startsWith('/signin'));
}
async function signOut(page: Page) {
	await page
		.getByRole('button', { name: /Sign out/ })
		.first()
		.click();
}

test('env present', () => {
	for (const k of ['QA_ADMIN_EMAIL', 'QA_ADMIN_PASSWORD', 'QA_TENANT_EMAIL', 'QA_TENANT_PASSWORD'])
		expect(process.env[k], `missing ${k}`).toBeTruthy();
});

test('authentication: unauthenticated page request redirects to signin', async ({ page }) => {
	await page.goto('/maintenance');
	await expect(page).toHaveURL(/\/signin$/);
	await shot(page, 'authentication-unauthenticated-redirect');
});

test('authentication: invalid credentials show error toast', async ({ page }) => {
	await page.goto('/signin');
	await page.getByTitle('Email').fill(process.env.QA_TENANT_EMAIL!);
	await page.getByTitle('Password').fill('Wrong-pass-123');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByText('Your email or password is incorrect.')).toBeVisible();
	await expect(page).toHaveURL(/\/signin/);
	await shot(page, 'authentication-invalid-credentials');
});

test('access-control + authentication: admin sign-in lands on /admin with admin nav, sign-out works', async ({
	page
}) => {
	await signIn(page, 'ADMIN');
	await expect(page).toHaveURL(/\/admin$/);
	for (const n of ['Home', 'Maintenance', 'Properties', 'Users', 'Profile'])
		await expect(page.getByRole('link', { name: n, exact: true }).first()).toBeVisible();
	await expect(page.getByRole('link', { name: 'Payment', exact: true })).toHaveCount(0);
	await shot(page, 'access-control-admin-landing-and-nav');
	await page.goto('/');
	await expect(page).toHaveURL(/\/admin$/);
	await signOut(page);
	await expect(page).toHaveURL(/\/signin/);
	await page.goto('/admin/users');
	await expect(page).toHaveURL(/\/signin$/);
	await shot(page, 'authentication-sign-out');
});

test('tenant: sign-in, nav, profile, request submitted', async ({ page }) => {
	await signIn(page, 'TENANT');
	await expect(page).toHaveURL(/\/$/);
	for (const n of ['Dashboard', 'Maintenance', 'Payment', 'Profile', 'Insurance', 'About Us'])
		await expect(page.getByRole('link', { name: n, exact: true }).first()).toBeVisible();
	await shot(page, 'access-control-tenant-nav');

	await page.goto('/profile');
	await expect(page.getByTitle('Email')).toHaveValue(process.env.QA_TENANT_EMAIL!);
	await expect(page.getByTitle('First Name')).not.toHaveValue('');
	await shot(page, 'user-profile-tenant-loads');

	await page.goto('/maintenance');
	await page.getByTitle('Subject').fill(SUBJECT);
	await page.getByTitle('Description').fill('qa regression test request, please ignore');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Successfully added maintenance request.')).toBeVisible();
	await expect(page.getByText(SUBJECT)).toBeVisible();
	await shot(page, 'maintenance-requests-valid-submission');

	// invalid form: empty subject creates nothing (wait for the first toast to go away first)
	await expect(page.getByText('Successfully added maintenance request.')).toHaveCount(0, {
		timeout: 20000
	});
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.waitForTimeout(2000);
	await expect(page.getByText('Successfully added maintenance request.')).toHaveCount(0);
	await expect(page.getByText(SUBJECT)).toHaveCount(1);
	await shot(page, 'maintenance-requests-invalid-form');
});

test('tenant: insurance validation', async ({ page }) => {
	await signIn(page, 'TENANT');
	await page.goto('/insurance');
	await page.getByTitle('Insurance Company Name').fill('qa-insurer');
	await page.getByTitle('Policy Number').fill('qa-0001');
	await page.getByTitle('Start Date').fill('2026-06-10');
	await page.getByTitle('End Date').fill('2026-06-01');
	await page.getByRole('button', { name: 'Save' }).click();
	await page.waitForTimeout(1000);
	// the form uses customValidity, so the message is the browser validation message on the end date input
	const msg = await page
		.getByTitle('End Date')
		.evaluate((el: HTMLInputElement) => el.validationMessage);
	const visibleText = await page.getByText('End date must be after start date').count();
	console.log(
		'end date validationMessage:',
		JSON.stringify(msg),
		'visible text matches:',
		visibleText
	);
	expect(msg === 'End date must be after start date' || visibleText > 0).toBeTruthy();
	await expect(page.getByText('Successfully updated user info.')).toHaveCount(0);
	await shot(page, 'renters-insurance-end-date-not-after-start');
});

test('tenant: payment prompt, over-balance refused, small amount goes to Stripe test checkout', async ({
	page
}) => {
	await signIn(page, 'TENANT');
	await page.goto('/payment');
	await expect(page.getByText(/You have a balance of/)).toBeVisible();
	await page.waitForLoadState('networkidle'); // hydrate before clicking
	await page.getByRole('button', { name: 'Make a Payment' }).click();
	await expect(page.getByText('Enter Payment Amount')).toBeVisible();
	await shot(page, 'rent-payments-amount-prompt');
	const input = page.locator('.modal input[type=number]');
	await input.fill('5000');
	await page.locator('.modal').getByRole('button', { name: 'Submit' }).click();
	await expect(page.locator('.toast, [data-toast]').first()).toBeVisible();
	await expect(page).toHaveURL(/\/payment/);
	await shot(page, 'rent-payments-over-balance');
	await expect(page.locator('.modal input[type=number]')).toHaveCount(0); // closing animation done

	await page.getByRole('button', { name: 'Make a Payment' }).click();
	await page.locator('.modal input[type=number]').fill('1');
	await page.locator('.modal').getByRole('button', { name: 'Submit' }).click();
	await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(3000);
	// Stripe shows a "Sandbox" badge (or "Test mode") on test checkouts; amount = 1.00 rent + 0.33 fee
	await expect(page.getByText(/sandbox|test mode/i).first()).toBeVisible();
	await expect(page.getByText('$1.33').first()).toBeVisible();
	// do not enter card details. Clip to the left half so the prefilled email is not captured.
	await shot(page, 'rent-payments-stripe-checkout-test-mode', {
		clip: { x: 0, y: 0, width: 620, height: 400 }
	});
});

test('admin: maintenance close, properties, users, edit page', async ({ page }) => {
	await signIn(page, 'ADMIN');
	await page.goto('/admin/maintenance');
	await page.waitForLoadState('networkidle'); // hydrate before clicking
	const row = page.locator('div.flex-row', { hasText: SUBJECT });
	await expect(row).toBeVisible();
	await shot(page, 'maintenance-requests-admin-list');
	// close this run's request, plus any leftover qa-regression request from an earlier run
	for (let i = 0; i < 5; i++) {
		const r = page
			.locator('div.flex-row', { hasText: 'qa-regression-' })
			.filter({ has: page.locator('button.btn-icon') })
			.first();
		if ((await r.count()) === 0) break;
		await r.getByRole('button').first().click();
		await page.locator('.modal input[name=prompt]').fill('qa-closed, no work needed');
		await page.locator('.modal').getByRole('button', { name: 'Submit' }).click();
		await expect(page.getByText('Successfully closed request.').first()).toBeVisible();
		await page.waitForTimeout(1500);
	}
	await expect(
		page.locator('div.flex-row', { hasText: SUBJECT }).getByText('Work Done: qa-closed')
	).toBeVisible();
	await shot(page, 'maintenance-requests-close');

	await page.goto('/admin/properties');
	await expect(page.locator('ul.list a.card').first()).toBeVisible();
	await shot(page, 'property-management-directory');
	const qaProp = page.locator('ul.list a.card', { hasText: 'qa-property' }).first();
	await qaProp.click();
	await expect(page).toHaveURL(/\/admin\/properties\/.+\/edit/);
	await expect(page.locator('#page-content')).toContainText(/Tenant/i);
	await shot(page, 'property-management-edit-page');

	await page.goto('/admin/users');
	await expect(page.getByText(/Name:/).first()).toBeVisible();
	// mask rows of real (non-QA) users so their personal data is not captured
	await shot(page, 'user-management-directory', {
		extraMask: [page.locator('ul.list li').filter({ hasNotText: /QA (Admin|Tenant)/ })]
	});
	await page.locator('ul.list li button').first().click();
	await page.getByText('Insurance', { exact: true }).click();
	await expect(page.getByTestId('modal-component')).toContainText(
		/No insurance info|Policy|Company/i
	);
	// Only the modal: the user list behind it holds other people's names, photos and contact details.
	const modal = page.locator('.modal.card').first();
	const box = (await modal.boundingBox())!;
	await shot(page, 'renters-insurance-admin-insurance-tab', {
		clip: { x: box.x, y: box.y, width: box.width, height: box.height },
		scope: '.modal.card'
	});
});

test('user-profile: admin profile loads', async ({ page }) => {
	await signIn(page, 'ADMIN');
	await page.goto('/profile');
	await expect(page.getByTitle('Email')).toHaveValue(process.env.QA_ADMIN_EMAIL!);
	await shot(page, 'user-profile-admin-loads');
});
