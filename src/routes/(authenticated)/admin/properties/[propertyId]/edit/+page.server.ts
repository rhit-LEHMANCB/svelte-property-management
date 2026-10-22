import type { PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { adminDB, adminStorage } from '$lib/server/admin';
import { propertySchema } from '$lib/schemas';
import { error, fail } from '@sveltejs/kit';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { FieldValue } from 'firebase-admin/firestore';
import type { PhotoItem } from '../../../../../../app';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { listPropertyLeases } from '$lib/server/leases';

export const load = (async (event) => {
	const userId = getUserIdOrError(event.locals.userID);

	await getAdminUserDataOrError(userId);

	const propertyData = (
		await adminDB.collection('properties').doc(event.params.propertyId).get()
	).data();

	if (!propertyData) {
		throw error(404, 'Property not found');
	}

	const form = await superValidate(propertyData, zod(propertySchema));
	const photos: PhotoItem[] = propertyData.photos ?? [];
	return {
		form,
		photos,
		leases: await listPropertyLeases(event.params.propertyId)
	};
}) satisfies PageServerLoad;

export const actions = {
	basicInfo: async (event) => {
		const form = await superValidate(event, zod(propertySchema));

		const userId = getUserIdOrError(event.locals.userID);

		await getAdminUserDataOrError(userId);

		if (!form.valid) {
			return message(form, 'Invalid form');
		}

		await adminDB.collection('properties').doc(event.params.propertyId).update(form.data);
		return message(form, 'Form submitted');
	},
	photos: async ({ request, locals, params }) => {
		const userId = getUserIdOrError(locals.userID);

		await getAdminUserDataOrError(userId);

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
