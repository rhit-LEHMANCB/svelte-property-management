import { expect, type Locator, type Page } from '@playwright/test';
import { signIn } from '../../e2e/support/helpers';

export const SHOTS = 'openspec/changes/make-ui-consistent/qa/screenshots/cycle-2';
export const shot = (page: Page, name: string, mask: Locator[] = []) =>
	page.screenshot({ path: `${SHOTS}/${name}.jpg`, type: 'jpeg', quality: 60, fullPage: true, mask: [page.getByText(/@/), ...mask] });

export const signInAs = (page: Page, who: 'tenant' | 'admin') =>
	signIn(
		page,
		who === 'tenant'
			? { email: process.env.QA_TENANT_EMAIL!, password: process.env.QA_TENANT_PASSWORD! }
			: { email: process.env.QA_ADMIN_EMAIL!, password: process.env.QA_ADMIN_PASSWORD! }
	);

export async function open(page: Page, path: string) {
	await page.goto(path);
	await page.waitForLoadState('networkidle');
}
export const box = async (l: Locator) => {
	const b = await l.boundingBox();
	if (!b) throw new Error('not visible');
	return b;
};
export { expect };

/** Property created by this QA run (60-char title). Deleted at the end of the run. */
export const QA_PROPERTY = 'bvf8KiUpPY4EJfLtYXww';
export const QA_PROPERTY_TITLE = 'qa-' + 'x'.repeat(57);
/** Existing dev property 'boom' (read only use). */
export const BOOM = 'wrIhk0hPRVK1hDCaId8y';

/** Finds a lease edit URL on a property (read only). */
export async function firstLeaseHref(page: Page, propertyId: string) {
	await open(page, `/admin/properties/${propertyId}/edit`);
	await page.getByRole('tab', { name: 'Leases' }).or(page.getByRole('button', { name: 'Leases' })).first().click();
	await page.waitForTimeout(800);
	const hrefs = await page.locator('main a[href*="/leases/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
	return hrefs.find((h) => !h.endsWith('/new')) ?? null;
}
