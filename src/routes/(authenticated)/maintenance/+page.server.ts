import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { maintenanceSchema } from '$lib/schemas';
import { adminDB } from '$lib/server/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { MaintenanceRequest } from '../../../app';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { currentTenancy, loadTenantLeases } from '$lib/server/leases';

export const load = (async (event) => {
	getUserIdOrError(event.locals.userID);

	const { userProperty, userLeases = [] } = await event.parent();

	// A tenant without a current lease has no property to report problems for. The page says why
	// (naming the lease that starts next) instead of leaving.
	if (!userProperty) {
		const next = userLeases
			.filter((lease) => lease.status === 'upcoming')
			.sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
		return {
			form: await superValidate(zod(maintenanceSchema)),
			openMaintenanceRequests: [] as MaintenanceRequest[],
			closedMaintenanceRequests: [] as MaintenanceRequest[],
			noProperty: { upcoming: next ? { address: next.address, startDate: next.startDate } : null }
		};
	}

	const maintenanceRequestQuery = adminDB
		.collection('maintenance')
		.where('propertyId', '==', userProperty.id);
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

	const form = await superValidate(zod(maintenanceSchema));
	return {
		form,
		openMaintenanceRequests,
		closedMaintenanceRequests,
		noProperty: null
	};
}) satisfies PageServerLoad;

export const actions = {
	default: async (event) => {
		const form = await superValidate(event, zod(maintenanceSchema));

		const userId = getUserIdOrError(event.locals.userID);

		if (!form.valid) {
			return message(form, 'Invalid form');
		}

		// Requests are only for the property of the tenant's current lease.
		const tenancy = currentTenancy(await loadTenantLeases(userId));
		if (!tenancy) {
			throw redirect(303, '/');
		}
		const propertyId = tenancy.lease.propertyId;
		const propertyData = tenancy.property;
		const propertyAddress = `${propertyData.streetAddress}, ${propertyData.city}, ${propertyData.state}`;

		const submitter = (await adminDB.collection('users').doc(userId).get()).data();

		if (!submitter) {
			throw error(500, 'Failed to find submitter data.');
		}

		await adminDB.collection('maintenance').add({
			...form.data,
			status: 'Open',
			propertyId,
			propertyAddress,
			dateAdded: FieldValue.serverTimestamp(),
			submitter: `${submitter.firstName} ${submitter.lastName}`
		});

		return message(form, 'Form submitted');
	}
};
