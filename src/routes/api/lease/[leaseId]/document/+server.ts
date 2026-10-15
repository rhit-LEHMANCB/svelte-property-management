import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { adminDB, adminStorage } from '$lib/server/admin';
import { getUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import type { LeaseDoc } from '$lib/server/leaseDates';

/** The lease PDF, for admins and the lease's tenants only. Storage rules deny direct reads. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const userId = getUserIdOrError(locals.userID);
	const user = await getUserDataOrError(userId);

	const lease = (await adminDB.collection('leases').doc(params.leaseId).get()).data() as
		LeaseDoc | undefined;
	const allowed = user.permissions === 'admin' || (lease?.tenantIds ?? []).includes(userId);
	// The same answer for a missing lease and someone else's, so ids cannot be probed.
	if (!lease || !allowed) throw error(403, 'You do not have access to this lease.');
	if (!lease.document) throw error(404, 'This lease has no document.');

	let bytes: Buffer;
	try {
		[bytes] = await adminStorage
			.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`)
			.file(lease.document.path)
			.download();
	} catch (err) {
		// The record points at a file that is gone (for example a cleanup that failed part way).
		console.log('Lease document missing from storage', err instanceof Error ? err.message : err);
		throw error(404, 'This lease has no document.');
	}
	const fileName = lease.document.fileName.replace(/[^\w.\- ]/g, '_');
	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `inline; filename="${fileName}"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
