import { beforeEach, describe, expect, it } from 'vitest';
import {
	FakeFieldPath,
	FakeFieldValue,
	FakeFirestore,
	FakeTimestamp,
	FirestoreNotFoundError
} from '../helpers/fakeFirestore';

// The handler tests trust this fake, so it is tested on its own against documented Firestore behavior.
let db: FakeFirestore;
beforeEach(() => {
	db = new FakeFirestore();
});

const ids = async (q: { get(): Promise<{ docs: { id: string }[] }> }) =>
	(await q.get()).docs.map((d) => d.id);

describe('FakeFirestore: documents', () => {
	it('set then get returns a copy, not the stored object', async () => {
		await db
			.collection('users')
			.doc('u1')
			.set({ name: 'Ada', tags: ['a'] });
		const snap = await db.collection('users').doc('u1').get();
		expect(snap.exists).toBe(true);
		const data = snap.data() as { tags: string[] };
		data.tags.push('mutated');
		expect((await db.doc('users/u1').get()).data()).toEqual({ name: 'Ada', tags: ['a'] });
	});

	it('get on a missing document is not an error and has no data', async () => {
		const snap = await db.collection('users').doc('nope').get();
		expect(snap.exists).toBe(false);
		expect(snap.data()).toBeUndefined();
	});

	it('set without merge replaces the whole document', async () => {
		await db.doc('users/u1').set({ a: 1, b: 2 });
		await db.doc('users/u1').set({ c: 3 });
		expect(db.peek('users/u1')).toEqual({ c: 3 });
	});

	it('set with merge deep-merges nested maps and keeps other fields', async () => {
		await db.doc('p/2026').set({ March: { remainingBalance: 100 }, keep: true });
		await db
			.doc('p/2026')
			.set({ March: { note: 'x' }, April: { remainingBalance: 5 } }, { merge: true });
		expect(db.peek('p/2026')).toEqual({
			March: { remainingBalance: 100, note: 'x' },
			April: { remainingBalance: 5 },
			keep: true
		});
	});

	it('update changes only the named fields and replaces a named map entirely', async () => {
		await db.doc('users/u1').set({ a: 1, insurance: { x: 1, y: 2 } });
		await db.doc('users/u1').update({ a: 2, insurance: { z: 3 } });
		expect(db.peek('users/u1')).toEqual({ a: 2, insurance: { z: 3 } });
	});

	it('update supports dotted paths for nested fields', async () => {
		await db.doc('users/u1').set({ insurance: { x: 1, y: 2 } });
		await db.doc('users/u1').update({ 'insurance.x': 9 });
		expect(db.peek('users/u1')).toEqual({ insurance: { x: 9, y: 2 } });
	});

	it('update on a missing document fails with NOT_FOUND, as Firestore does', async () => {
		await expect(db.doc('users/ghost').update({ a: 1 })).rejects.toBeInstanceOf(
			FirestoreNotFoundError
		);
	});

	it('delete removes the document and is harmless when it is already gone', async () => {
		await db.doc('users/u1').set({ a: 1 });
		await db.doc('users/u1').delete();
		await db.doc('users/u1').delete();
		expect(db.peek('users/u1')).toBeUndefined();
	});

	it('add generates an id and returns a reference to the new document', async () => {
		const ref = await db.collection('maintenance').add({ status: 'Open' });
		expect(ref.id).toMatch(/^auto-id-/);
		expect((await ref.get()).data()).toEqual({ status: 'Open' });
	});
});

describe('FakeFirestore: field values', () => {
	it('serverTimestamp stores a Timestamp', async () => {
		await db.doc('m/1').set({ dateAdded: FakeFieldValue.serverTimestamp() });
		expect(db.peek('m/1')?.dateAdded).toBeInstanceOf(FakeTimestamp);
	});

	it('increment adds to the stored number, treating a missing field as 0', async () => {
		await db.doc('p/y').set({ balance: 100 });
		await db.doc('p/y').set({ balance: FakeFieldValue.increment(-30) }, { merge: true });
		await db.doc('p/y').set({ fresh: FakeFieldValue.increment(5) }, { merge: true });
		expect(db.peek('p/y')).toEqual({ balance: 70, fresh: 5 });
	});

	it('arrayUnion appends only elements that are not already present, comparing by value', async () => {
		const ts = FakeTimestamp.fromMillis(1_700_000_000_000);
		await db.doc('p/y').set({ tx: [{ date: ts, amount: 10 }] });
		await db.doc('p/y').update({
			tx: FakeFieldValue.arrayUnion({ date: ts, amount: 10 }, { date: ts, amount: 20 })
		});
		expect(db.peek('p/y')?.tx).toHaveLength(2);
	});

	it('arrayRemove drops matching elements by value', async () => {
		await db.doc('p/1').set({ photos: [{ id: 'a' }, { id: 'b' }] });
		await db.doc('p/1').update({ photos: FakeFieldValue.arrayRemove({ id: 'a' }) });
		expect(db.peek('p/1')?.photos).toEqual([{ id: 'b' }]);
	});

	it('sentinels inside nested maps resolve against the nested value on a merge set', async () => {
		await db.doc('p/2026').set({ March: { remainingBalance: 100, transactions: [] } });
		await db
			.doc('p/2026')
			.set({ March: { remainingBalance: FakeFieldValue.increment(-40) } }, { merge: true });
		expect(db.peek('p/2026')).toEqual({ March: { remainingBalance: 60, transactions: [] } });
	});
});

describe('FakeFirestore: queries', () => {
	beforeEach(async () => {
		await db.doc('junction/a_p1').set({ tenantId: 'a', propertyId: 'p1' });
		await db.doc('junction/b_p1').set({ tenantId: 'b', propertyId: 'p1' });
		await db.doc('junction/c_p2').set({ tenantId: 'c', propertyId: 'p2' });
	});

	it('where == filters by field', async () => {
		expect(await ids(db.collection('junction').where('propertyId', '==', 'p1'))).toEqual([
			'a_p1',
			'b_p1'
		]);
	});

	it('size and empty reflect the result', async () => {
		const snap = await db.collection('junction').where('tenantId', '==', 'zzz').get();
		expect(snap.size).toBe(0);
		expect(snap.empty).toBe(true);
	});

	it('where not-in on the document id excludes the listed ids', async () => {
		const q = db.collection('users');
		await db.doc('users/u1').set({ n: 1 });
		await db.doc('users/u2').set({ n: 2 });
		await db.doc('users/u3').set({ n: 3 });
		expect(await ids(q.where(FakeFieldPath.documentId(), 'not-in', ['u1', 'u3']))).toEqual(['u2']);
	});

	it('chained where clauses all apply', async () => {
		const q = db
			.collection('junction')
			.where('propertyId', '==', 'p1')
			.where('tenantId', '==', 'b');
		expect(await ids(q)).toEqual(['b_p1']);
	});

	it('orderBy sorts ascending and descending, including Timestamps, and limit caps the result', async () => {
		for (const [id, ms] of [
			['x', 3000],
			['y', 1000],
			['z', 2000]
		] as const) {
			await db
				.doc(`maintenance/${id}`)
				.set({ dateAdded: FakeTimestamp.fromMillis(ms), status: 'Open' });
		}
		const open = db.collection('maintenance').where('status', '==', 'Open');
		expect(await ids(open.orderBy('dateAdded', 'desc'))).toEqual(['x', 'z', 'y']);
		expect(await ids(open.orderBy('dateAdded', 'asc'))).toEqual(['y', 'z', 'x']);
		expect(await ids(open.orderBy('dateAdded', 'desc').limit(2))).toEqual(['x', 'z']);
	});

	it('orderBy leaves out documents that lack the ordered field, as Firestore does', async () => {
		await db.doc('users/a').set({ lastName: 'Zed' });
		await db.doc('users/b').set({ lastName: 'Abe' });
		await db.doc('users/c').set({ firstName: 'NoLast' });
		expect(await ids(db.collection('users').orderBy('lastName'))).toEqual(['b', 'a']);
	});

	it('forEach visits every document and a snapshot ref can delete it', async () => {
		const snap = await db.collection('junction').where('propertyId', '==', 'p1').get();
		snap.forEach((doc) => void doc.ref.delete());
		expect(await ids(db.collection('junction'))).toEqual(['c_p2']);
	});
});

describe('FakeFirestore: subcollections', () => {
	it('keeps subcollection documents apart from the parent collection', async () => {
		await db.doc('properties/p1').set({ title: 'One' });
		await db
			.collection('properties')
			.doc('p1')
			.collection('payment_history')
			.doc('2026')
			.set({ ok: true });
		expect(await ids(db.collection('properties'))).toEqual(['p1']);
		expect(await ids(db.doc('properties/p1').collection('payment_history'))).toEqual(['2026']);
	});
});
