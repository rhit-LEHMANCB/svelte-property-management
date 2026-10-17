import { createHash, timingSafeEqual } from 'node:crypto';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { JOBS_SECRET } from '$env/static/private';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { runDailyJob } from '$lib/server/billingJob';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Whether the request carries the environment's job secret. An empty secret matches nothing. */
function hasJobSecret(request: Request) {
	const header = request.headers.get('authorization') ?? '';
	const match = /^Bearer (.+)$/.exec(header);
	if (!JOBS_SECRET || !match) return false;
	return timingSafeEqual(digest(match[1]), digest(JOBS_SECRET));
}

/**
 * The daily billing job. Cloud Scheduler calls it at 6:00 Eastern with the job secret; a signed-in
 * admin can also run it. Everyone else gets 401.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	let runBy = 'scheduler';
	if (!hasJobSecret(request)) {
		const userId = getUserIdOrError(locals.userID);
		await getAdminUserDataOrError(userId);
		runBy = `admin:${userId}`;
	}

	const result = await runDailyJob(new Date(), runBy);
	if (result.kind === 'busy') throw error(409, 'The daily job is already running.');
	const { summary } = result;
	// Errors answer 500, so Cloud Scheduler retries; a retry repeats nothing that already succeeded.
	return json(
		{
			date: summary.date,
			leases: summary.leases,
			feesCharged: summary.feesCharged.length,
			autopayCharges: summary.autopayCharges.length,
			emailsSent: summary.emailsSent.length,
			errors: summary.errors.length
		},
		{ status: summary.errors.length > 0 ? 500 : 200 }
	);
};
