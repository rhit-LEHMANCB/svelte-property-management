import { test } from '@playwright/test';
import { searchList, signInAs } from './support';

// Removes every `qa-protect-` property this run created. A property whose lease has a payment is
// refused by design (that is the feature), so those are listed and left for an admin to end/hide.
test('cleanup: delete qa-protect- properties that can be deleted', async ({ page }) => {
	test.setTimeout(240_000);
	await signInAs(page, 'admin');
	const left: string[] = [];
	for (let i = 0; i < 30; i++) {
		await searchList(page, 'qa-protect-');
		const buttons = page.getByRole('button', { name: /^Actions for qa-protect-/ });
		const names: string[] = [];
		for (const b of await buttons.all()) names.push(((await b.getAttribute('aria-label')) ?? '').replace('Actions for ', ''));
		const todo = names.filter((n) => !left.includes(n));
		if (!todo.length) break;
		const title = todo[0];
		await page.getByRole('button', { name: `Actions for ${title}`, exact: true }).click();
		await page.getByRole('menuitem', { name: 'Delete' }).click();
		await page.getByRole('button', { name: 'Confirm' }).click();
		await page.waitForTimeout(3500);
		const ok = await page.getByText('Property Successfully Removed.').count();
		if (!ok) left.push(title);
	}
	console.log('LEFT (refused, paid):', JSON.stringify(left));
});
