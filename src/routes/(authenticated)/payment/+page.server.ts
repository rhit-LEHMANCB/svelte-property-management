import type { PageServerLoad } from './$types';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { businessToday } from '$lib/server/leaseDates';
import { tenantLeaseSummaries } from '$lib/server/tenantSummary';

export const load = (async (event) => {
	const uid = getUserIdOrError(event.locals.userID);

	const { userLeases = [] } = await event.parent();
	const today = businessToday();

	const leases = (await tenantLeaseSummaries(uid, userLeases, today)).filter(
		(lease) => lease.status !== 'ended' || lease.balanceCents > 0
	);

	// Current and upcoming leases are listed even with nothing owed, so autopay can be set up before
	// move-in; an ended lease only while it owes money. With nothing to list, the page says so.
	return { leases };
}) satisfies PageServerLoad;
