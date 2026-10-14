import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { PROJECT_ID, STORAGE_EMULATOR } from './constants';

// Admin SDK handles for specs that need to create data. They only work while the Firebase emulators
// are running, because no credentials are configured.
const app = () => getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
export const adminAuth = () => getAuth(app());
export const adminDb = () => getFirestore(app());

// Storage emulator calls as the owner ('Bearer owner' bypasses the rules), for specs that need to
// put a file in place or check that one is gone. The bucket is the one the e2e app is given.
const storageObjects = `http://${STORAGE_EMULATOR}/v0/b/${PROJECT_ID}.appspot.com/o`;
const owner = { Authorization: 'Bearer owner' };

/** Whether a file exists in the Storage emulator. */
export async function storageFileExists(path: string) {
	const response = await fetch(`${storageObjects}/${encodeURIComponent(path)}`, { headers: owner });
	if (response.status !== 200 && response.status !== 404) {
		throw new Error(`Unexpected Storage emulator answer ${response.status} for ${path}`);
	}
	return response.status === 200;
}

/** Uploads a file to the Storage emulator. */
export async function uploadStorageFile(path: string, body: Buffer, contentType: string) {
	const response = await fetch(`${storageObjects}?name=${encodeURIComponent(path)}`, {
		method: 'POST',
		headers: { ...owner, 'Content-Type': contentType },
		body: new Uint8Array(body)
	});
	if (!response.ok) throw new Error(`Could not upload ${path} (${response.status})`);
}
