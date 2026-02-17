import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDB, adminStorage } from '$lib/server/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import type { PhotoItem } from '../../../../../app';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const userId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(userId);

	const { photos } = await request.json();

	if (!(photos as PhotoItem[])) {
		throw error(400, 'Photo must be a valid type');
	}

	return adminDB
		.collection('properties')
		.doc(params.propertyId)
		.update({
			photos: photos
		})
		.then(() => {
			return json({ status: 'Photos reordered' });
		})
		.catch((err) => {
			console.log(err.message);
			throw error(500, err);
		});
};

export const DELETE: RequestHandler = async ({ params, locals, request }) => {
	const userId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(userId);

	const { photo } = await request.json();

	if (!(photo as PhotoItem)) {
		throw error(400, 'Photo must be a valid type');
	}

	return Promise.all([
		adminDB
			.collection('properties')
			.doc(params.propertyId)
			.update({
				photos: FieldValue.arrayRemove(photo)
			}),
		adminStorage
			.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`)
			.file(`properties/${params.propertyId}/images/${photo.id}`)
			.delete()
	])
		.then(() => {
			return json({ status: 'Photo Deleted' });
		})
		.catch((err) => {
			console.log(err.message);
			throw error(500, err);
		});
};
