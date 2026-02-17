import type { PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms/server';
import { adminDB, adminStorage } from '$lib/server/admin';
import { propertySchema } from '$lib/schemas';
import { error, fail } from '@sveltejs/kit';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import type { DocumentWithId, PhotoItem } from '../../../../../../../app';

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

	const tenantJunctions = await adminDB
		.collection('junction_user_property')
		.where('propertyId', '==', event.params.propertyId)
		.get();

	const tenantsAsList = tenantJunctions.docs.map((junction) => {
		return junction.data().tenantId;
	});

	let usersOptions: { label: string; value: string }[];

	if (tenantsAsList.length > 0) {
		usersOptions = (
			await adminDB.collection('users').where(FieldPath.documentId(), 'not-in', tenantsAsList).get()
		).docs.map((doc) => ({
			label: `${doc.data().firstName} ${doc.data().lastName}`,
			value: doc.id
		}));
	} else {
		usersOptions = (await adminDB.collection('users').get()).docs.map((doc) => ({
			label: `${doc.data().firstName} ${doc.data().lastName}`,
			value: doc.id
		}));
	}

	const tenantPromises = tenantJunctions.docs.map(async (junction) => {
		const user = await adminDB.collection('users').doc(junction.data().tenantId).get();
		return { id: user.id, data: user.data() };
	});

	const tenants: DocumentWithId[] = (await Promise.all(tenantPromises)).filter((tenant) => {
		return tenant.data;
	}) as DocumentWithId[];

	const form = await superValidate(propertyData, propertySchema);
	const photos: PhotoItem[] = propertyData.photos ?? [];
	return {
		form,
		photos,
		usersOptions,
		tenants
	};
}) satisfies PageServerLoad;

export const actions = {
	basicInfo: async (event) => {
		const form = await superValidate(event, propertySchema);

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

		await adminDB.collection('properties').doc(event.params.propertyId).update(form.data);
		return message(form, 'Form submitted');
	},
	photos: async ({ request, locals, params }) => {
		if (!locals.userID) {
			throw error(401, 'You must be logged in to do this.');
		}

		const userData = (await adminDB.collection('users').doc(locals.userID).get()).data();

		if (!userData || !userData.permissions || userData.permissions !== 'admin') {
			throw error(401, 'You must be an admin to do this.');
		}

		const data = await request.formData();
		const files = data.getAll('photos');
		if ((files[0] as File).size == 0) {
			return fail(400);
		}
		const storageRef = adminStorage.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`);
		await Promise.all(
			files.map(async (entry, index) => {
				const file = entry as File;
				const ext = file.name.split('.').pop();
				const fileName = `${index}-${Date.now().toString()}.${ext}`;
				const blob = storageRef.file(`properties/${params.propertyId}/images/${fileName}`);
				const blobSteam = blob.createWriteStream({ resumable: false });
				blobSteam.end(new Uint8Array(await file.arrayBuffer()));
				return {
					id: fileName,
					photoUrl: `https://firebasestorage.googleapis.com/v0/b/${PUBLIC_FB_STORAGE_BUCKET}/o/properties%2F${params.propertyId}%2Fimages%2F${fileName}?alt=media`
				};
			})
		).then(async (files) => {
			await adminDB
				.collection('properties')
				.doc(params.propertyId)
				.update({
					photos: FieldValue.arrayUnion(...files)
				});
		});
	}
};
