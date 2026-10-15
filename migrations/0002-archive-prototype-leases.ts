import type { Migration } from '../scripts/migrate/types';

const ARCHIVE = 'legacy_leases';

/**
 * The 2024 leases prototype wrote documents into `leases` with `users` instead of `tenantIds`. The
 * lease pages cannot read them, so they are moved to `legacy_leases`, untouched apart from a note of
 * when and why. They are not turned into leases: they are old test data, and as ended leases with no
 * payments they would show months of rent as owed.
 */
const migration: Migration = {
	name: '0002-archive-prototype-leases',
	description:
		'Move documents in leases that have no tenantIds list (written by the 2024 prototype) to legacy_leases.',
	undo: [
		'1. For each legacy_leases/{id} document, write its data back to leases/{id} without the archivedAt and archivedBy fields, then delete legacy_leases/{id}.',
		'2. Delete _migrations/0002-archive-prototype-leases.',
		'The lease pages fail on such documents again once they are back.'
	].join('\n'),

	async up({ db, now, log, write }) {
		const prototypes = (await db.collection('leases').get()).docs.filter(
			(doc) => !Array.isArray(doc.data().tenantIds)
		);
		// Every document is checked before any is moved, so a stop leaves the data as it was. The
		// prototype documents have no subcollections; one that does was written some other way and
		// needs a person to look at it.
		for (const doc of prototypes) {
			const subcollections = await doc.ref.listCollections();
			if (subcollections.length > 0) {
				throw new Error(
					`leases/${doc.id} has no tenantIds but has subcollections (${subcollections.map((c) => c.id).join(', ')}); move it by hand`
				);
			}
		}

		const archived: string[] = [];
		for (const doc of prototypes) {
			const data = doc.data();
			await write.set(db.collection(ARCHIVE).doc(doc.id), {
				...data,
				archivedAt: now.toISOString(),
				archivedBy: '0002-archive-prototype-leases'
			});
			await write.delete(doc.ref);
			log(`leases/${doc.id} (property ${data.propertyId ?? 'none'}) moved to ${ARCHIVE}`);
			archived.push(doc.id);
		}
		return { archived };
	}
};

export default migration;
