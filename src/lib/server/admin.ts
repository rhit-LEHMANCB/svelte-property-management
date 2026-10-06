import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { FB_CLIENT_EMAIL, FB_PRIVATE_KEY } from '$env/static/private';
import { PUBLIC_FB_PROJECT_ID } from '$env/static/public';
import pkg from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';

try {
	const { privateKey } = JSON.parse(FB_PRIVATE_KEY);
	pkg.initializeApp({
		credential: pkg.credential.cert({
			projectId: PUBLIC_FB_PROJECT_ID,
			clientEmail: FB_CLIENT_EMAIL,
			privateKey: privateKey
		})
	});
} catch (err) {
	console.error('Firebase Admin Error: ', err);
}

export const adminDB = getFirestore();
export const adminAuth = getAuth();
export const adminStorage = getStorage();
