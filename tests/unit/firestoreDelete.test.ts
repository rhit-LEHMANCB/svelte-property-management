import { describe, expect, it } from 'vitest';
import { deleteDocs } from '$lib/server/firestoreDelete';
import { services } from '../helpers/services';

const { db } = services;

describe('deleteDocs', () => {
	it('deletes 1,200 documents across several batches', async () => {
		const refs = [];
		for (let i = 0; i < 1200; i++) {
			db.seed(`things/${i}`, { i });
			refs.push(db.doc(`things/${i}`));
		}

		await deleteDocs(refs as never);

		expect((await db.collection('things').get()).size).toBe(0);
	});

	it('does nothing for an empty list', async () => {
		await expect(deleteDocs([])).resolves.toBeUndefined();
	});
});
