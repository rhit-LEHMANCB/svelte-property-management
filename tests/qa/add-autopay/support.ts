import { expect, type Locator, type Page } from '@playwright/test';
import { signIn } from '../../e2e/support/helpers';

export const SHOTS = 'openspec/changes/add-autopay/qa/screenshots';
export const shot = (page: Page, slug: string) =>
	page.screenshot({ path: `${SHOTS}/autopay-${slug}.png`, fullPage: true });

export const tenant = () => ({
	email: process.env.QA_TENANT_EMAIL!,
	password: process.env.QA_TENANT_PASSWORD!
});
export const admin = () => ({
	email: process.env.QA_ADMIN_EMAIL!,
	password: process.env.QA_ADMIN_PASSWORD!
});
export const signInAs = (page: Page, who: 'tenant' | 'admin') =>
	signIn(page, who === 'tenant' ? tenant() : admin());

// QA lease used for enrollment. It is an ended QA lease; the spec always turns autopay off again.
export const CREDIT_LEASE = 'cMbStS2LIUsbkinqemgt';
export const CREDIT_PROPERTY = 'Dbqj4T31aYytM4b0Wovg';
// A lease with a balance, used only to start (never complete) a one-time Checkout.
export const PAYMENTS_LEASE = 'cMbStS2LIUsbkinqemgt';

export async function leaseCard(page: Page, leaseId: string) {
	await page.goto('/payment');
	await page.waitForLoadState('networkidle');
	const card = page.locator(`[data-lease="${leaseId}"]`);
	await expect(card).toBeVisible();
	return card;
}

/** Screenshot one element (scrolled into view) with any email address on the page masked. */
export async function shotEl(page: Page, el: Locator, slug: string) {
	await el.scrollIntoViewIfNeeded();
	await el.screenshot({
		path: `${SHOTS}/autopay-${slug}.png`,
		mask: [page.getByText(/@/)]
	});
}
