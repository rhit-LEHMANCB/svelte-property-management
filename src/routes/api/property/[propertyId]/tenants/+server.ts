import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDB } from '$lib/server/admin';
import { getAdminUserDataOrError, getUserIdOrError } from '$lib/server/authHelpers';
import { MOVE_IN_MONTH_PATTERN, getMonthKey } from '$lib/server/payments';

const isValidId = (value: unknown): value is string =>
	typeof value === 'string' && value.length > 0 && !value.includes('/');

// A move-in month more than five years back is almost certainly a typo and would charge years of rent.
const isValidMonth = (value: unknown): value is string => {
	if (typeof value !== 'string' || !MOVE_IN_MONTH_PATTERN.test(value)) return false;
	const { year, month } = getMonthKey(new Date());
	return value >= `${year - 5}-${String(month).padStart(2, '0')}`;
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const userId = getUserIdOrError(locals.userID);

	await getAdminUserDataOrError(userId);

	const { tenantId, moveInMonth } = await request.json();

	if (!tenantId || !isValidId(tenantId)) {
		throw error(400, 'Please provide a Tenant Id');
	}

	if (moveInMonth !== undefined && !isValidMonth(moveInMonth)) {
		throw error(400, 'Move-in month must be in the form YYYY-MM');
	}

	const [property, tenant, assignments] = await Promise.all([
		adminDB.collection('properties').doc(params.propertyId).get(),
		adminDB.collection('users').doc(tenantId).get(),
		adminDB.collection('junction_user_property').where('tenantId', '==', tenantId).get()
	]);

	if (!property.exists) {
		throw error(404, 'Property not found');
	}

	if (!tenant.exists) {
		throw error(404, 'User not found');
	}

	if (tenant.data()?.permissions === 'admin') {
		throw error(400, 'Admins cannot be assigned to a property');
	}

	if (assignments.docs.some((doc) => doc.data().propertyId !== params.propertyId)) {
		throw error(409, 'This tenant already has a property. Remove them from it first.');
	}

	const junction = adminDB
		.collection('junction_user_property')
		.doc(`${tenantId}_${params.propertyId}`);

	// Re-adding an assigned tenant (or a retried request) must not reset their move-in month.
	const existingMonth = moveInMonth ?? (await junction.get()).data()?.moveInMonth;

	return junction
		.set({
			tenantId: tenantId,
			propertyId: params.propertyId,
			moveInMonth: existingMonth ?? getMonthKey(new Date()).key
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

	if (!tenantId || !isValidId(tenantId)) {
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
