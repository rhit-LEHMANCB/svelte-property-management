import { describe, expect, it, vi } from 'vitest';
import { call } from '../helpers/callHandler';
import { seedAdmin } from '../helpers/seed';

// billing-jobs: Daily run, with no job secret configured in the environment.
vi.mock('$env/static/private', async (original) => ({
	...(await original<Record<string, unknown>>()),
	JOBS_SECRET: ''
}));

const { POST: runJob } = await import('../../src/routes/api/jobs/daily/+server');

describe('billing-jobs: Daily run without a job secret', () => {
	it('Scenario: No secret configured: a bearer header is refused, a signed-in admin can still run it', async () => {
		seedAdmin('admin-1');
		const asScheduler = await call(runJob, {
			userID: null,
			method: 'POST',
			headers: { authorization: 'Bearer jobs-secret-fixture' },
			body: {}
		});
		expect(asScheduler.status).toBe(401);
		const asAdmin = await call(runJob, { userID: 'admin-1', method: 'POST', body: {} });
		expect(asAdmin.status).toBe(200);
	});
});
