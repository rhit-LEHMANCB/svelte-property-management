import { adminDB } from '$lib/server/admin';
import type { Timestamp } from 'firebase-admin/firestore';
import type { PageServerLoad } from './$types';
import { MaintenanceRequest } from '../../../../app';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';

export const load = (async (event) => {
	const userId = getUserIdOrError(event.locals.userID);

	await getAdminUserDataOrError(userId);

	const maintenanceRequestQuery = adminDB.collection('maintenance');
	const openMaintenanceRequests = (
		await maintenanceRequestQuery
			.where('status', '==', 'Open')
			.orderBy('dateAdded', 'desc')
			.limit(5)
			.get()
	).docs.map((request) => {
		const data = request.data();
		const dateAdded = data.dateAdded as Timestamp;
		const dateClosed = data.dateClosed as Timestamp;
		return {
			...data,
			id: request.id,
			dateAdded: dateAdded ? dateAdded.toDate() : undefined,
			dateClosed: dateClosed ? dateClosed.toDate() : undefined
		} as MaintenanceRequest;
	});
	const closedMaintenanceRequests = (
		await maintenanceRequestQuery
			.where('status', '==', 'Closed')
			.orderBy('dateClosed', 'desc')
			.limit(5)
			.get()
	).docs.map((request) => {
		const data = request.data();
		const dateAdded = data.dateAdded as Timestamp;
		const dateClosed = data.dateClosed as Timestamp;
		return {
			...data,
			id: request.id,
			dateAdded: dateAdded ? dateAdded.toDate() : undefined,
			dateClosed: dateClosed ? dateClosed.toDate() : undefined
		} as MaintenanceRequest;
	});
	return { closedMaintenanceRequests, openMaintenanceRequests };
}) satisfies PageServerLoad;
