import { adminDB } from '$lib/server/admin';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const userId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(userId);

	const { workDone } = await request.json();

	if (!workDone) {
		throw error(400, 'Please provide work done.');
	}

	return adminDB
		.collection('maintenance')
		.doc(params.requestId)
		.update({ status: 'Closed', dateClosed: FieldValue.serverTimestamp(), workDone })
		.then(() => {
			return json({ status: 'Request Closed' });
		})
		.catch((err) => {
			console.log(err.message);
			throw error(500, err);
		});
};
