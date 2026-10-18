import { expect, type Locator, type Page } from '@playwright/test';
import { signIn } from '../../e2e/support/helpers';

export const SHOTS = 'openspec/changes/make-ui-consistent/qa/screenshots';
export const QA_PROPERTY_TITLE = 'qa-ui-consistency-property-with-a-deliberately-long-title-ab'; // 60 characters
export const NOTES =
	'/tmp/claude-0/-home-user-svelte-property-management/584e15ae-a96d-5796-bd83-2a82151ea492/scratchpad/notes.jsonl';

export const account = (who: 'admin' | 'tenant') =>
	who === 'admin'
		? { email: process.env.QA_ADMIN_EMAIL!, password: process.env.QA_ADMIN_PASSWORD! }
		: { email: process.env.QA_TENANT_EMAIL!, password: process.env.QA_TENANT_PASSWORD! };
export const signInAs = (page: Page, who: 'admin' | 'tenant') => signIn(page, account(who));

/** Screenshot with every email address (text or input) masked. */
export async function shot(
	page: Page,
	slug: string,
	opts: { target?: Locator; full?: boolean } = {}
) {
	const path = `${SHOTS}/${slug}.png`;
	const mask = [
		page.getByText(/@/),
		page.locator('input[type="email"], input[name="email"], input[name="emails"]')
	];
	if (opts.target) {
		await opts.target.scrollIntoViewIfNeeded();
		await opts.target.screenshot({ path, mask });
	} else {
		await page.screenshot({ path, fullPage: opts.full ?? false, mask });
	}
}

export async function go(page: Page, url: string) {
	await page.goto(url);
	await page.waitForLoadState('networkidle');
}

export const box = async (l: Locator) => {
	const b = await l.boundingBox();
	if (!b) throw new Error('no box');
	return b;
};

export const padding = (l: Locator) =>
	l.evaluate((el) => {
		const s = getComputedStyle(el);
		return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].join(' ');
	});

export const noHScroll = (page: Page) =>
	page.evaluate(() => {
		const d = document.documentElement;
		let worst = d.scrollWidth - d.clientWidth;
		for (const el of Array.from(document.querySelectorAll('*'))) {
			const s = getComputedStyle(el);
			if (
				/(auto|scroll)/.test(s.overflowX) &&
				el.scrollWidth > el.clientWidth + 1 &&
				el.clientWidth > 300
			) {
				worst = Math.max(worst, el.scrollWidth - el.clientWidth);
			}
		}
		return worst;
	});

export { expect };
