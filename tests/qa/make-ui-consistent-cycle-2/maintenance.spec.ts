import { test, expect, type Page } from '@playwright/test';
import { open, shot, signInAs } from './support';

test.use({ viewport: { width: 1280, height: 1300 } });
test.setTimeout(120_000);

async function tabsCheck(page: Page, who: 'tenant' | 'admin', path: string, title: string, slug: string) {
	await signInAs(page, who);
	await open(page, path);
	const openTab = page.getByRole('tab', { name: /^Open \(\d+\)/ });
	const closedTab = page.getByRole('tab', { name: /^Closed \(\d+\)/ });
	await expect(openTab).toHaveAttribute('aria-selected', 'true');
	await expect(closedTab).toHaveAttribute('aria-selected', 'false');
	const card = page.locator('main').getByRole('heading', { name: title, exact: true }).locator('xpath=ancestor::*[contains(@class,"card")][1]');
	await expect(card.getByRole('tab')).toHaveCount(2);
	const nOpen = Number((await openTab.innerText()).match(/\((\d+)\)/)![1]);
	const nClosed = Number((await closedTab.innerText()).match(/\((\d+)\)/)![1]);
	console.log(who, 'open', nOpen, 'closed', nClosed);
	expect(nOpen).toBeLessThanOrEqual(5);
	expect(nClosed).toBeLessThanOrEqual(5);
	const rows = () => page.locator('main [role="tabpanel"]:visible tbody tr');
	const openSubjects = await rows().allInnerTexts();
	await shot(page, `maintenance-requests-${slug}-open`);
	await closedTab.click();
	await expect(closedTab).toHaveAttribute('aria-selected', 'true');
	await expect(openTab).toHaveAttribute('aria-selected', 'false');
	await expect(card.getByRole('tab', { selected: true })).toHaveText(/^Closed/);
	const closedSubjects = await rows().allInnerTexts();
	console.log(who, 'open rows', openSubjects.length, 'closed rows', closedSubjects.length);
	expect(closedSubjects.join()).not.toBe(openSubjects.join());
	// still the same card
	await expect(card.locator('[role="tabpanel"]:visible')).toHaveCount(1);
	await shot(page, `maintenance-requests-${slug}-closed`);
}

test.describe('maintenance-requests', () => {
	test('Tenant View + Switch tabs: Open/Closed tabs in one "Your requests" card', async ({ page }) => {
		await tabsCheck(page, 'tenant', '/maintenance', 'Your requests', 'tenant-switch-tabs');
	});
	test('Admin View: "Requests" card with Open/Closed tabs', async ({ page }) => {
		await tabsCheck(page, 'admin', '/admin/maintenance', 'Requests', 'admin-view');
	});
	test('Tenant View: only own property requests (address check)', async ({ page }) => {
		await signInAs(page, 'tenant');
		await open(page, '/maintenance');
		const txt = await page.locator('main').innerText();
		expect(txt).not.toMatch(/qa-billing|Maple Ave/);
	});
});
