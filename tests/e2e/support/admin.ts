import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { PROJECT_ID } from './constants';

// Admin SDK handles for specs that need to create data. They only work while the Firebase emulators
// are running, because no credentials are configured.
const app = () => getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
export const adminAuth = () => getAuth(app());
export const adminDb = () => getFirestore(app());
