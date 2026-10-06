// Shared by the Playwright config, the seed script and the specs. Emulator-only values.
export const PROJECT_ID = 'demo-lehman-realty';
export const APP_PORT = 5174;
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;
export const FAKE_STRIPE_PORT = 12111;
export const FAKE_STRIPE_URL = `http://127.0.0.1:${FAKE_STRIPE_PORT}`;

export const AUTH_EMULATOR = '127.0.0.1:9099';
export const FIRESTORE_EMULATOR = '127.0.0.1:8080';

export const ADMIN = {
	uid: 'e2e-admin',
	email: 'admin@e2e.test',
	password: 'E2e-Admin-Passw0rd',
	firstName: 'Ada',
	lastName: 'Admin'
};

export const TENANT = {
	uid: 'e2e-tenant',
	email: 'tenant@e2e.test',
	password: 'E2e-Tenant-Passw0rd',
	firstName: 'Tom',
	lastName: 'Tenant',
	stripeID: 'cus_e2e'
};

export const PROPERTY = {
	id: 'e2e-property',
	title: 'E2E Maple Court',
	streetAddress: '1 Main St',
	city: 'Terre Haute',
	state: 'IN',
	rent: 1000
};
