import { services } from './services';

/** Seed the in-memory Firestore with the users and properties most handler tests need. */
export const db = services.db;

export function seedAdmin(id = 'admin-1', extra: Record<string, unknown> = {}) {
	db.seed(`users/${id}`, {
		email: `${id}@example.com`,
		firstName: 'Ada',
		lastName: 'Admin',
		phoneNumber: '+15555550100',
		permissions: 'admin',
		...extra
	});
	return id;
}

export function seedTenant(id = 'tenant-1', extra: Record<string, unknown> = {}) {
	db.seed(`users/${id}`, {
		email: `${id}@example.com`,
		firstName: 'Tom',
		lastName: 'Tenant',
		phoneNumber: '+15555550101',
		permissions: 'user',
		stripeID: `cus_${id}`,
		...extra
	});
	return id;
}

export function seedProperty(id = 'prop-1', extra: Record<string, unknown> = {}) {
	db.seed(`properties/${id}`, {
		title: 'Maple Court',
		description: 'Two bedroom apartment',
		bedrooms: 2,
		bathrooms: 1,
		squareFeet: 900,
		rent: 1200,
		streetAddress: '1 Main St',
		apartmentInfo: '',
		city: 'Terre Haute',
		state: 'IN',
		zip: '47803',
		...extra
	});
	return id;
}

export function linkTenant(tenantId: string, propertyId: string) {
	db.seed(`junction_user_property/${tenantId}_${propertyId}`, { tenantId, propertyId });
}
