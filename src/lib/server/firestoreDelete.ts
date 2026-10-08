import type { DocumentReference } from 'firebase-admin/firestore';
import { adminDB } from './admin';

// Firestore allows at most 500 writes in one batch.
const BATCH_SIZE = 500;

/** Deletes every document, in awaited batches of 500. Missing documents are skipped by Firestore. */
export const deleteDocs = async (refs: DocumentReference[]) => {
	for (let i = 0; i < refs.length; i += BATCH_SIZE) {
		const batch = adminDB.batch();
		refs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
		await batch.commit();
	}
};
