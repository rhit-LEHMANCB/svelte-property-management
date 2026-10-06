import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
	ADMIN,
	AUTH_EMULATOR,
	FIRESTORE_EMULATOR,
	PROJECT_ID,
	PROPERTY,
	TENANT
} from './constants';

/**
 * Runs once before the e2e specs: empties the Auth and Firestore emulators, then seeds one admin,
 * one tenant, one property and the tenant's link to it. Every run starts from the same data.
 */
export default async function globalSetup() {
	if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
		throw new Error(
			'The Firebase emulators are not running. Use `npm run test:e2e`, which starts them.'
		);
	}

	await fetch(`http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
		method: 'DELETE'
	});
	await fetch(
		`http://${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
		{ method: 'DELETE' }
	);

	const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
	const auth = getAuth(app);
	const db = getFirestore(app);

	for (const user of [ADMIN, TENANT]) {
		await auth.createUser({
			uid: user.uid,
			email: user.email,
			password: user.password,
			emailVerified: true
		});
	}

	await db.doc(`users/${ADMIN.uid}`).set({
		email: ADMIN.email,
		firstName: ADMIN.firstName,
		lastName: ADMIN.lastName,
		phoneNumber: '+15555550100',
		permissions: 'admin'
	});
	await db.doc(`users/${TENANT.uid}`).set({
		email: TENANT.email,
		firstName: TENANT.firstName,
		lastName: TENANT.lastName,
		phoneNumber: '+15555550101',
		permissions: 'user',
		stripeID: TENANT.stripeID
	});
	await db.doc(`properties/${PROPERTY.id}`).set({
		title: PROPERTY.title,
		description: 'Seeded for end-to-end tests',
		bedrooms: 2,
		bathrooms: 1,
		squareFeet: 900,
		rent: PROPERTY.rent,
		streetAddress: PROPERTY.streetAddress,
		apartmentInfo: '',
		city: PROPERTY.city,
		state: PROPERTY.state,
		zip: '47803'
	});
	await db
		.doc(`junction_user_property/${TENANT.uid}_${PROPERTY.id}`)
		.set({ tenantId: TENANT.uid, propertyId: PROPERTY.id });
}
