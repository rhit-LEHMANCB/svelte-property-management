import { message, superValidate } from 'sveltekit-superforms/server';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { maintenanceSchema } from '$lib/schemas';
import { adminDB } from '$lib/server/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { MaintenanceRequest } from '../../../../app';

export const load = (async (event) => {
	if (!event.locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}

	const { userProperty } = await event.parent();

	if (!userProperty) {
		throw error(500, 'Failed to find property info.');
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

	const form = await superValidate(maintenanceSchema);
	return {
		form,
		openMaintenanceRequests,
		closedMaintenanceRequests
	};
}) satisfies PageServerLoad;

export const actions = {
	default: async (event) => {
		const form = await superValidate(event, maintenanceSchema);

		if (!event.locals.userID) {
			throw error(401, 'You must be logged in to do this.');
		}

		if (!form.valid) {
			return message(form, 'Invalid form');
		}

		const userJunctionsQuery = await adminDB
			.collection('junction_user_property')
			.where('tenantId', '==', event.locals.userID)
			.get();

		if (userJunctionsQuery.size !== 1) {
			throw error(
				500,
				`User is associated with wrong number of properties: ${userJunctionsQuery.size}`
			);
		}

		const property = await adminDB
			.collection('properties')
			.doc(userJunctionsQuery.docs[0].data().propertyId)
			.get();

		const propertyId = property.id;
		const propertyData = property.data();
		if (!propertyData) {
			throw error(500, 'Failed to get property details');
		}
		const propertyAddress = `${propertyData.streetAddress}, ${propertyData.city}, ${propertyData.state}`;

		const submitter = (await adminDB.collection('users').doc(event.locals.userID).get()).data();

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
