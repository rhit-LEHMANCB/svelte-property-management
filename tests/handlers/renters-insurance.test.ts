import { describe, expect, it } from 'vitest';
import { actions, load } from '../../src/routes/(authenticated)/insurance/+page.server';
import { call } from '../helpers/callHandler';
import { db, seedTenant } from '../helpers/seed';

const policy = {
	companyName: 'Acme Insurance',
	policyNumber: 'P-123',
	startDate: '2026-01-01',
	endDate: '2027-01-01'
};

describe('renters-insurance: record policy (insurance page action)', () => {
	it('Scenario: Valid submission stores the policy with dates as YYYY-MM-DD strings', async () => {
		seedTenant('t1');

		const result = await call(actions.default, { userID: 't1', form: policy });

		expect(result.data.form.message).toBe('Form submitted');
		expect(db.peek('users/t1')?.insurance).toEqual(policy);
		// Other user fields are untouched.
		expect(db.peek('users/t1')).toMatchObject({ permissions: 'user', firstName: 'Tom' });
	});

	it('Scenario: End date not after start date is rejected and nothing is stored', async () => {
		seedTenant('t1');

		for (const endDate of ['2026-01-01', '2025-12-31']) {
			const result = await call(actions.default, {
				userID: 't1',
				form: { ...policy, endDate }
			});
			expect(result.data.form.valid).toBe(false);
			expect(result.data.form.message).toBe('Invalid form');
			expect(result.data.form.errors.endDate).toContain('End date must be after start date');
		}
		expect(db.peek('users/t1')).not.toHaveProperty('insurance');
	});

	it('Scenario: a missing company name is rejected', async () => {
		seedTenant('t1');

		const result = await call(actions.default, {
			userID: 't1',
			form: { ...policy, companyName: '' }
		});

		expect(result.data.form.message).toBe('Invalid form');
		expect(db.peek('users/t1')).not.toHaveProperty('insurance');
	});

	it('Scenario: an anonymous caller is rejected with 401', async () => {
		const result = await call(actions.default, { userID: null, form: policy });

		expect(result.status).toBe(401);
	});
});

describe('renters-insurance: prefill existing policy (insurance page load)', () => {
	it('Scenario: Existing policy prefills the form, with stored date strings parsed back to dates', async () => {
		seedTenant('t1', { insurance: policy });

		const result = await call(load, { userID: 't1' });

		expect(result.data.form.data.companyName).toBe('Acme Insurance');
		expect(result.data.form.data.policyNumber).toBe('P-123');
		expect(result.data.form.data.startDate).toBeInstanceOf(Date);
		expect((result.data.form.data.startDate as Date).toISOString()).toBe(
			'2026-01-01T00:00:00.000Z'
		);
		expect((result.data.form.data.endDate as Date).toISOString()).toBe('2027-01-01T00:00:00.000Z');
	});

	it('Scenario: a user with no policy gets an empty form', async () => {
		seedTenant('t1');

		const result = await call(load, { userID: 't1' });

		expect(result.data.form.data.companyName).toBe('');
		expect(result.data.form.data.policyNumber).toBe('');
	});

	it('Scenario: an anonymous caller is rejected with 401', async () => {
		expect((await call(load, { userID: null })).status).toBe(401);
	});
});
