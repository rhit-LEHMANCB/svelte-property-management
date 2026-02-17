import type { PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms/server';
import { adminDB, adminStorage } from '$lib/server/admin';
import { leaseSchema, propertySchema } from '$lib/schemas';
import { error, fail } from '@sveltejs/kit';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { DocumentWithId, PhotoItem } from '../../../../../../../app';
import { zod } from 'sveltekit-superforms/adapters';
import { formatDate } from '$lib/DatePicker/date-utils';

export const load = (async (event) => {
	if (!event.locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}
	const userData = (await adminDB.collection('users').doc(event.locals.userID).get()).data();

	if (!userData || !userData.permissions || userData.permissions !== 'admin') {
		throw error(401, 'You must be an admin to do this.');
	}

	const propertyData = (
		await adminDB.collection('properties').doc(event.params.propertyId).get()
	).data();

	if (!propertyData) {
		throw error(500, 'Error retrieving property');
	}

	const form = await superValidate(zod(leaseSchema));
	const usersOptions = (await adminDB.collection('users').get()).docs.map((doc) => ({
		label: `${doc.data().firstName} ${doc.data().lastName} (${doc.data().email})`,
		value: doc.id
	}));
	return {
		form,
		usersOptions
	};
}) satisfies PageServerLoad;

export const actions = {
	lease: async (event) => {
		const form = await superValidate(event, zod(leaseSchema));

		if (!event.locals.userID) {
			throw error(401, 'You must be logged in to do this.');
		}

		const userData = (await adminDB.collection('users').doc(event.locals.userID).get()).data();

		if (!userData || !userData.permissions || userData.permissions !== 'admin') {
			throw error(401, 'You must be an admin to do this.');
		}

		if (!form.valid) {
			return message(form, 'Invalid form');
		}

		const storageRef = adminStorage.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`);
		await storageRef.deleteFiles({
			prefix: `properties/${event.params.propertyId}/lease`
		});
		const ext = form.data.lease.name.split('.').pop();
		const fileName = `${Date.now().toString()}.${ext}`;
		const blob = storageRef.file(`properties/${event.params.propertyId}/lease/${fileName}`);
		const blobSteam = blob.createWriteStream({ resumable: false });
		blobSteam.end(new Uint8Array(await form.data.lease.arrayBuffer()));

		form.data.startDate.setHours(24);
		form.data.endDate.setHours(24);

		const newDoc = await adminDB.collection('leases').add({
			...form.data,
			lease: `https://firebasestorage.googleapis.com/v0/b/${PUBLIC_FB_STORAGE_BUCKET}/o/properties%2F${event.params.propertyId}%2Flease%2F${fileName}?alt=media`,
			propertyId: event.params.propertyId,
			startDate: formatDate(form.data.startDate),
			startTimestamp: Timestamp.fromDate(form.data.startDate),
			endDate: formatDate(form.data.endDate),
			endTimestamp: Timestamp.fromDate(form.data.endDate)
		});
		return message(form, `id${newDoc.id}`);
	}
};
