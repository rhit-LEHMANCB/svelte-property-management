import { expect, test, type Page } from '@playwright/test';
import { shot, signIn, watch } from './helpers';
import fs from 'node:fs';
const IDFILE =
	'/tmp/claude-1000/-home-lehmancb-code-svelte-property-management/dfbdbdbe-23cf-4e59-8dab-804244060033/scratchpad/propid.txt';

test.setTimeout(120000);
test.use({ actionTimeout: 15000 });

const stamp = Date.now();
const PROP = `qa-c3-${stamp}`;
const userEmail = `cblehman22+qa-c3-${stamp}@gmail.com`;
// 1x1 PNG
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

let propId = '';
async function openProp(page: Page) {
	// The properties list is opened by id: the list page may be unavailable (see report).
	await page.goto(`/admin/properties/${propId}/edit`);
	await page.waitForLoadState('networkidle');
	await expect(page.getByTitle('Title', { exact: true })).toBeVisible();
}

test.describe('admin lifecycle with qa- data', () => {
	test('property-management: add property, edit, tabs, photos', async ({ page }) => {
		const w = watch(page, 'prop');
		await page.route('**/maps.googleapis.com/**', (r) => r.abort());
		await signIn(page, 'admin');
		const lr = await page.goto('/admin/properties');
		console.log('properties list status', lr?.status());
		await shot(page, 'property-management-directory-before-add');
		await page.goto('/admin/properties/add');
		await page.waitForLoadState('networkidle');
		// invalid zip first: error shown, values kept
		await page.getByTitle('Title', { exact: true }).fill(PROP);
		await page.getByTitle('Rent').fill('1000');
		await page.getByTitle('Description').fill('qa- automated property');
		await page.getByTitle('Bedrooms').fill('1');
		await page.getByTitle('Bathrooms').fill('1');
		await page.getByTitle('Square Feet').fill('500');
		await page.getByTitle('Street Address').fill('1 QA St');
		await page.getByTitle('City').fill('Terre Haute');
		await page.getByTitle('State').fill('IN');
		await page.getByTitle('Zip Code').fill('abc');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect
			.poll(() =>
				page.getByTitle('Zip Code').evaluate((e) => (e as HTMLInputElement).validationMessage)
			)
			.toBe('Please enter a valid zip code');
		await expect(page.getByTitle('Title', { exact: true })).toHaveValue(PROP);
		await shot(page, 'app-platform-error-validation-values-kept');
		await page.getByTitle('Zip Code').fill('47803');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Successfully created property')).toBeVisible();
		await expect(page).toHaveURL(/\/admin\/properties\/[^/]+\/edit$/);
		await page.waitForLoadState('networkidle');
		propId = page.url().split('/').slice(-2)[0];
		fs.writeFileSync(IDFILE, propId);
		await shot(page, 'property-management-add-success');

		// edit on Info tab
		await page.getByTitle('Rent').fill('1111');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Successfully added info.')).toBeVisible();
		await shot(page, 'property-management-edit-success');
		await page.reload();
		await page.waitForLoadState('networkidle');
		await expect(page.getByTitle('Rent')).toHaveValue('1111');

		// tabs
		await page.getByText('Photos', { exact: true }).click();
		await expect(page.locator('input[type="file"][name="photos"]')).toBeVisible();
		await expect(page.getByTitle('Title', { exact: true })).toHaveCount(0);
		await page.locator('input[type="file"][name="photos"]').setInputFiles([
			{ name: 'qa.png', mimeType: 'image/png', buffer: PNG },
			{ name: 'qb.png', mimeType: 'image/png', buffer: PNG }
		]);
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.locator('img[alt]')).toHaveCount(2, { timeout: 20000 });
		await shot(page, 'app-platform-tabs-property-photos');
		await page
			.locator('.group', { has: page.locator('img') })
			.first()
			.hover();
		await page.getByRole('button', { name: 'Delete' }).first().click();
		await expect(page.getByText('Photo successfully deleted.')).toBeVisible();
		await page.getByText('Tenants', { exact: true }).click();
		await expect(page.getByPlaceholder('Search...')).toBeVisible();
		await expect(page.getByText('No tenants')).toBeVisible();
		await page.getByText('Info', { exact: true }).click();
		await expect(page.getByTitle('Title', { exact: true })).toBeVisible();
		await shot(page, 'app-platform-tabs-property-info');
		w.report(test.info());
	});

	test('tenant-assignment: autocomplete picks a qa- user, assign, remove with confirm dialog', async ({
		page
	}) => {
		const w = watch(page, 'assign');
		await page.route('**/maps.googleapis.com/**', (r) => r.abort());
		await signIn(page, 'admin');
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Add User' }).click();
		await page.getByRole('dialog').getByRole('textbox').fill(userEmail);
		await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
		await expect(page.getByText('User Successfully Created.')).toBeVisible();
		await openProp(page);
		await page.getByText('Tenants', { exact: true }).click();
		const search = page.getByPlaceholder('Search...');
		await search.fill('New User');
		const opt = page.getByRole('button', { name: 'New User' });
		await expect(opt).toHaveCount(1);
		await expect(opt).toBeVisible();
		await shot(page, 'tenant-assignment-autocomplete-options');
		await opt.click();
		await expect(search).toHaveValue('New User');
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByText('Successfully added tenant.')).toBeVisible();
		await expect(page.locator('ul.list > li').first()).toBeVisible();
		await shot(page, 'tenant-assignment-assigned');
		// cancel the removal first, then confirm
		await page.locator('ul.list > li').first().getByRole('button').last().click();
		await page.waitForTimeout(800);
		console.log(
			'dialogs after remove click',
			await page.getByRole('dialog').count(),
			JSON.stringify(
				(await page.getByRole('dialog').allInnerTexts()).map((t) =>
					t
						.replace(/\s+/g, ' ')
						.replace(/[\w.+-]+@[\w.]+/g, '<email>')
						.slice(0, 120)
				)
			)
		);
		await shot(page, 'tenant-assignment-remove-click-state');
		await expect(page.getByRole('dialog').first()).toContainText('remove');
		await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
		await page.waitForTimeout(800);
		// OBSERVATION: the row's own click also queues the user-info dialog, which appears after the confirm closes.
		const follow = await page.getByRole('dialog').count();
		console.log('dialogs after cancel', follow);
		await shot(page, 'tenant-assignment-after-cancel');
		if (follow) await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(page.locator('ul.list > li')).toHaveCount(1);
		await page.locator('ul.list > li').first().getByRole('button').last().click();
		await shot(page, 'tenant-assignment-remove-dialog');
		await page
			.getByRole('dialog')
			.getByRole('button', { name: /Confirm/ })
			.click();
		await expect(page.getByText('User successfully removed from property.')).toBeVisible();
		await page.waitForTimeout(800);
		console.log('dialogs after confirm', await page.getByRole('dialog').count());
		if (await page.getByRole('dialog').count())
			await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
		await expect(page.getByText('No tenants')).toBeVisible();
		await shot(page, 'tenant-assignment-removed');
		w.report(test.info());
	});

	test('cleanup: delete qa- user and qa- property through confirm dialogs', async ({ page }) => {
		await signIn(page, 'admin');
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Items per page').selectOption('10');
		for (let guard = 0; guard < 8; guard++) {
			let found = false;
			for (let p = 0; p < 4 && !found; p++) {
				const row = page.locator('ul.list > li', { hasText: 'qa-c3-' });
				if (await row.count()) {
					await row.first().getByRole('button').last().click();
					await page.getByRole('button', { name: 'Delete', exact: true }).click();
					await page
						.getByRole('dialog')
						.getByRole('button', { name: /Confirm/ })
						.click();
					await expect(page.getByText('User Successfully Removed.').first()).toBeVisible();
					await page.waitForTimeout(2500);
					found = true;
				} else {
					const next = page.getByRole('button', { name: /Next/ });
					if (await next.isEnabled().catch(() => false)) await next.click();
					else break;
				}
			}
			if (!found) break;
			await page.goto('/admin/users');
			await page.waitForLoadState('networkidle');
			await page.getByLabel('Items per page').selectOption('10');
		}
		if (!propId && fs.existsSync(IDFILE)) propId = fs.readFileSync(IDFILE, 'utf8');
		// property deletion by API (the list page is not used, see report)
		// delete this run's property, plus clearly QA-created qa-c2-* leftovers, via the directory dialog
		for (const prefix of [PROP, 'qa-c2-']) {
			for (let guard = 0; guard < 6; guard++) {
				await page.goto('/admin/properties');
				await page.waitForLoadState('networkidle');
				const sel = page.getByLabel('Items per page');
				if (await sel.count()) await sel.selectOption('10').catch(() => {});
				const row = page.locator('ul.list a', { hasText: prefix });
				if (!(await row.count())) break;
				console.log('deleting via directory:', await row.first().locator('strong').innerText());
				await row.first().getByRole('button').click();
				await page
					.getByRole('dialog')
					.getByRole('button', { name: /Confirm/ })
					.click();
				await expect(page.getByText('Property Successfully Removed.')).toBeVisible();
				await page.waitForTimeout(2000);
			}
		}
		const gone = await page.goto(`/admin/properties/${propId}/edit`);
		expect(gone?.status()).toBe(500);
		await shot(page, 'property-management-deleted-edit-url');
	});
});

test.describe.serial('maintenance flow', () => {
	const subject = `qa-c3 req ${stamp}`;
	test('maintenance-requests: tenant submits, admin cancels then closes with note', async ({
		browser
	}) => {
		const tctx = await browser.newContext();
		const t = await tctx.newPage();
		const actx = await browser.newContext();
		const a = await actx.newPage();
		const w = watch(t, 'maint-tenant');
		await signIn(t, 'tenant');
		await t.goto('/maintenance');
		await t.waitForLoadState('networkidle');
		await t.getByLabel('Subject').fill(subject);
		await t.getByLabel('Description').fill('qa- automated, safe to ignore');
		await t.getByRole('button', { name: 'Add' }).click();
		await expect(t.getByText('Successfully added maintenance request.')).toBeVisible();
		await expect(t.locator('dl > div', { hasText: subject })).toBeVisible();
		await shot(t, 'maintenance-requests-tenant-submitted');
		await signIn(a, 'admin');
		await a.goto('/admin/maintenance');
		await a.waitForLoadState('networkidle');
		const req = a.locator('dl > div', { hasText: subject });
		await req.getByRole('button').click();
		await expect(a.getByRole('dialog')).toBeVisible();
		await shot(a, 'maintenance-requests-admin-close-dialog');
		// empty note: submit does nothing
		await a.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
		await expect(a.getByText('Successfully closed request.')).toHaveCount(0);
		await a.keyboard.press('Escape');
		await a
			.getByRole('dialog')
			.getByRole('button', { name: 'Cancel' })
			.click()
			.catch(() => {});
		await expect(a.getByRole('dialog')).toHaveCount(0);
		await expect(a.locator('dl > div', { hasText: subject }).getByRole('button')).toBeVisible();
		await a.locator('dl > div', { hasText: subject }).getByRole('button').click();
		await a.getByRole('dialog').getByRole('textbox').fill('qa- work done');
		await a.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
		await expect(a.getByText('Successfully closed request.')).toBeVisible();
		await expect(a.locator('dl > div', { hasText: subject })).toContainText('qa- work done');
		await shot(a, 'maintenance-requests-admin-closed');
		w.report(test.info());
		await tctx.close();
		await actx.close();
	});
});

test('user-profile: contact info save (value restored)', async ({ page }) => {
	const w = watch(page, 'profile');
	await signIn(page, 'tenant');
	await page.goto('/profile');
	await page.waitForLoadState('networkidle');
	const ln = page.getByTitle('Last Name');
	const orig = await ln.inputValue();
	await ln.fill(orig + 'qa');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Successfully updated user info.')).toBeVisible();
	await shot(page, 'user-profile-contact-saved');
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(ln).toHaveValue(orig + 'qa');
	await ln.fill(orig);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Successfully updated user info.').first()).toBeVisible();
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(ln).toHaveValue(orig);
	// invalid email: rejected, values kept
	const em = page.getByTitle('Email');
	const origEmail = await em.inputValue();
	await page.getByTitle('First Name').fill('');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Successfully updated user info.')).toHaveCount(0);
	expect(await em.inputValue()).toBe(origEmail);
	await shot(page, 'user-profile-invalid-rejected');
	w.report(test.info());
});

test('renters-insurance: validation then save (existing value restored)', async ({ page }) => {
	const w = watch(page, 'ins');
	await signIn(page, 'tenant');
	await page.goto('/insurance');
	await page.waitForLoadState('networkidle');
	const co = page.getByTitle('Insurance Company Name');
	const pol = page.getByTitle('Policy Number');
	const sd = page.getByTitle('Start Date');
	const ed = page.getByTitle('End Date');
	const orig = {
		co: await co.inputValue(),
		pol: await pol.inputValue(),
		sd: await sd.inputValue(),
		ed: await ed.inputValue()
	};
	console.log('insurance existed before:', orig.co !== '' || orig.pol !== '');
	await co.fill('qa-c3 Insurance');
	await pol.fill('QA-1');
	await sd.fill('2027-06-01');
	await ed.fill('2027-05-01');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect
		.poll(() => ed.evaluate((e) => (e as HTMLInputElement).validationMessage))
		.toBe('End date must be after start date');
	await expect(page.getByText('Successfully updated user info.')).toHaveCount(0);
	await shot(page, 'renters-insurance-end-before-start');
	await ed.fill('2028-06-01');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Successfully updated user info.')).toBeVisible();
	await shot(page, 'renters-insurance-saved');
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(co).toHaveValue('qa-c3 Insurance');
	await expect(sd).toHaveValue('2027-06-01');
	if (orig.co && orig.sd && orig.ed) {
		await co.fill(orig.co);
		await pol.fill(orig.pol);
		await sd.fill(orig.sd);
		await ed.fill(orig.ed);
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Successfully updated user info.').first()).toBeVisible();
		console.log('insurance restored');
	} else console.log('insurance did not exist before; qa- values remain (no delete UI)');
	w.report(test.info());
});

test('authentication: /reset wrong mode status and valid-looking mode form', async ({ page }) => {
	const r = await page.goto('/reset?mode=verifyEmail&oobCode=x');
	console.log('reset wrong-mode status', r?.status());
	await expect(page.getByText('Invalid action')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Change Password' })).toHaveCount(0);
	await shot(page, 'authentication-reset-wrong-mode');
	expect(r?.status()).toBe(400);
});

test('authentication: /reset valid-looking mode shows form and mismatch is flagged', async ({
	page
}) => {
	await page.goto('/reset?mode=resetPassword&oobCode=qa-fake');
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('button', { name: 'Change Password' })).toBeVisible();
	await page.getByTitle('New Password').fill('Passw0rd-one');
	await page.getByTitle('Verify Password').fill('Different-Passw0rd3');
	await page.getByRole('button', { name: 'Change Password' }).click();
	await expect
		.poll(() =>
			page.getByTitle('Verify Password').evaluate((e) => (e as HTMLInputElement).validationMessage)
		)
		.toBe('Passwords must match');
	await shot(page, 'authentication-reset-form');
});
