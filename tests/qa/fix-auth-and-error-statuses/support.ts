import type { Page } from '@playwright/test';
export { signInAs } from '../add-autopay/support';

export const SHOTS = 'openspec/changes/fix-auth-and-error-statuses/qa/screenshots';
export const shot = (page: Page, slug: string) =>
	page.screenshot({ path: `${SHOTS}/${slug}.png`, fullPage: true, animations: 'disabled' });
export const EXISTING_PROPERTY = 'Dbqj4T31aYytM4b0Wovg';
export const MISSING_PROPERTY = 'qa-does-not-exist';
