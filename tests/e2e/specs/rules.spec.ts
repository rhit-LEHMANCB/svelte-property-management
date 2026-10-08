import { expect, test } from '@playwright/test';
import {
	ADMIN,
	AUTH_EMULATOR,
	FIRESTORE_EMULATOR,
	PROJECT_ID,
	STORAGE_EMULATOR
} from '../support/constants';

// firebase-configuration: the emulators load the committed firestore.rules and storage.rules. These
// requests do not use the 'Bearer owner' token the other specs send (the Admin SDK and that token
// bypass rules), so the rules decide the outcome. Each case runs anonymous and signed in, because
// the production rule this replaces (request.auth != null) denied only anonymous requests.
const firestore = `http://${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
// The rules use one wildcard bucket, so the bucket name only has to be one the emulator accepts.
const storage = `http://${STORAGE_EMULATOR}/v0/b/${PROJECT_ID}.appspot.com/o`;

const signedInHeaders = async () => {
	const response = await fetch(
		`http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=e2e-api-key`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: ADMIN.email,
				password: ADMIN.password,
				returnSecureToken: true
			})
		}
	);
	const { idToken } = await response.json();
	expect(idToken).toBeTruthy();
	return { Authorization: `Bearer ${idToken}` };
};

for (const [caller, headers] of [
	['anonymous', async () => ({})],
	['signed-in', signedInHeaders]
] as const) {
	test.describe(`firebase-configuration: committed rules (${caller})`, () => {
		test('Scenario: Firestore denies client access', async () => {
			const auth = await headers();
			const read = await fetch(`${firestore}/users/${ADMIN.uid}`, { headers: auth });
			expect(read.status).toBe(403);

			const write = await fetch(`${firestore}/rules_probe?documentId=probe`, {
				method: 'POST',
				headers: { ...auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ fields: { value: { stringValue: 'x' } } })
			});
			expect(write.status).toBe(403);
		});

		test('Scenario: Storage allows public read only', async () => {
			const auth = await headers();
			// Allowed by the rules, so the missing object is a 404 and not a 403.
			const read = await fetch(`${storage}/properties%2Fnone%2Fimages%2Fnone?alt=media`, {
				headers: auth
			});
			expect(read.status).toBe(404);

			const write = await fetch(`${storage}?name=rules_probe.txt`, {
				method: 'POST',
				headers: { ...auth, 'Content-Type': 'text/plain' },
				body: 'x'
			});
			expect(write.status).toBe(403);

			const list = await fetch(storage, { headers: auth });
			expect(list.status).toBe(403);
		});
	});
}
