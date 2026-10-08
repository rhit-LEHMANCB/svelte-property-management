import { expect, test } from '@playwright/test';
import { FIRESTORE_EMULATOR, PROJECT_ID, STORAGE_EMULATOR } from '../support/constants';

// firebase-configuration: the emulators load the committed firestore.rules and storage.rules. These
// requests carry no Authorization header, so the rules decide the outcome (the Admin SDK and the
// 'Bearer owner' requests used elsewhere bypass them).
const firestore = `http://${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const storage = `http://${STORAGE_EMULATOR}/v0/b/${PROJECT_ID}.appspot.com/o`;

test.describe('firebase-configuration: committed rules', () => {
	test('Scenario: Firestore denies client access', async () => {
		const read = await fetch(`${firestore}/users/e2e-admin`);
		expect(read.status).toBe(403);

		const write = await fetch(`${firestore}/rules_probe?documentId=probe`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ fields: { value: { stringValue: 'x' } } })
		});
		expect(write.status).toBe(403);
	});

	test('Scenario: Storage allows public read only', async () => {
		// Allowed by the rules, so the missing object is a 404 and not a 403.
		const read = await fetch(`${storage}/properties%2Fnone%2Fimages%2Fnone?alt=media`);
		expect(read.status).toBe(404);

		const write = await fetch(`${storage}?name=rules_probe.txt`, {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain' },
			body: 'x'
		});
		expect(write.status).toBe(403);

		const list = await fetch(storage);
		expect(list.status).toBe(403);
	});
});
