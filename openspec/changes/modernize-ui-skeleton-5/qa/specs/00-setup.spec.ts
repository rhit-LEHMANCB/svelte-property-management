import { test } from '@playwright/test';
import { signIn } from './helpers';
import { ensureQaProperty, ensureQaUser, linkQaTenantAccount } from './data';

test('setup qa- test data through the UI', async ({ page }) => {
	test.setTimeout(120000);
	await signIn(page, 'admin');
	await ensureQaProperty(page);
	await ensureQaUser(page);
	// the dedicated QA tenant account has no property; give it the qa- property for this run
	await linkQaTenantAccount(page, true);
});
