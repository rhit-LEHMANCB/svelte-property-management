import { adminDB } from '$lib/server/admin';
import type { Timestamp } from 'firebase-admin/firestore';
import type { MaintenanceRequest } from '../../../../../app';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load = (async (event) => {
	if (!event.locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}
	const userData = (await adminDB.collection('users').doc(event.locals.userID).get()).data();

	if (!userData || !userData.permissions || userData.permissions !== 'admin') {
		throw error(401, 'You must be an admin to do this.');
	}

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
