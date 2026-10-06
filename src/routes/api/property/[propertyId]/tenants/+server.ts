import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDB } from '$lib/server/admin';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { MOVE_IN_MONTH_PATTERN, getMonthKey } from '$lib/server/payments';

const isValidMonth = (value: unknown): value is string =>
	typeof value === 'string' && MOVE_IN_MONTH_PATTERN.test(value);

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const userId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(userId);

	const { tenantId, moveInMonth } = await request.json();

	if (!tenantId) {
		throw error(400, 'Please provide a Tenant Id');
	}

	if (moveInMonth !== undefined && !isValidMonth(moveInMonth)) {
		throw error(400, 'Move-in month must be in the form YYYY-MM');
	}

	return adminDB
		.collection('junction_user_property')
		.doc(`${tenantId}_${params.propertyId}`)
		.set({
			tenantId: tenantId,
			propertyId: params.propertyId,
			moveInMonth: moveInMonth ?? getMonthKey(new Date()).key
		})
		.then(() => {
			return json({ status: 'Tenant added' });
		})
		.catch((err) => {
			console.log(err.message);
			throw error(500, err);
		});
};

export const DELETE: RequestHandler = async ({ params, locals, request }) => {
	const userId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(userId);

	const { tenantId } = await request.json();

	if (!tenantId) {
		throw error(400, 'Please provide a Tenant Id');
	}

	return adminDB
		.collection('junction_user_property')
		.doc(`${tenantId}_${params.propertyId}`)
		.delete()
		.then(() => {
			return json({ status: 'Tenant removed' });
		})
		.catch((err) => {
			console.log(err.message);
			throw error(500, err);
		});
};

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
	const userId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(userId);

	const { tenantId, moveInMonth } = await request.json();

	if (!tenantId) {
		throw error(400, 'Please provide a Tenant Id');
	}

	if (!isValidMonth(moveInMonth)) {
		throw error(400, 'Move-in month must be in the form YYYY-MM');
	}

	const junction = adminDB
		.collection('junction_user_property')
		.doc(`${tenantId}_${params.propertyId}`);

	if (!(await junction.get()).exists) {
		throw error(404, 'Tenant is not assigned to this property');
	}

	await junction.update({ moveInMonth });

	return json({ status: 'Move-in month updated' });
};
