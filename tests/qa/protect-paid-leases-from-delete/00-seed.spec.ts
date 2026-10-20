import { expect, test } from '@playwright/test';
import { createLease, createProperty, loadSeed, payOnePound, saveSeed, signInAs, type Seed } from './support';

test.describe.configure({ mode: 'serial' });
const tenantEmail = () => process.env.QA_TENANT_EMAIL!;

test('seed: rent-paid, deposit-paid, unpaid and second unpaid properties', async ({ browser }) => {
	test.setTimeout(200_000);
	const seed: Seed = loadSeed();
	const admin = await (await browser.newContext()).newPage();
	await signInAs(admin, 'admin');
	const stamp = Date.now().toString(36);
	const defs: [string, { start: string; end?: string; deposit?: string; lateFee?: string; email?: string }][] = [
		['rent', { start: '2020-01-01', end: '2020-01-31' }],
		['deposit', { start: '2020-02-01', end: '2020-02-29', deposit: '50' }],
		['none', { start: '2020-03-01', end: '2020-03-31', lateFee: '10' }],
		['none2', { start: '2020-04-01', end: '2020-04-30' }],
		['other', { start: '2020-05-01', end: '2020-05-31' }]
	];
	for (const [key, lease] of defs) {
		if (seed[key]) continue;
		const title = `qa-protect-${key}-${stamp}`;
		const propertyId = await createProperty(admin, title);
		const leaseId = await createLease(admin, propertyId, lease);
		seed[key] = { propertyId, leaseId, title };
		saveSeed(seed);
	}
	// A lease whose edit page is used for the "delete a lease" check, with its own property.
	const tenant = await (await browser.newContext()).newPage();
	await signInAs(tenant, 'tenant');
	await payOnePound(tenant, seed.rent.leaseId!, '1');
	await payOnePound(tenant, seed.deposit.leaseId!, '1');
	expect(Object.keys(seed).length).toBe(5);
});
