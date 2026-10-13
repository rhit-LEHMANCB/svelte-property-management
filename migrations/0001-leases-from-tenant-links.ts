import type { DocumentData } from 'firebase-admin/firestore';
import type { Migration } from '../scripts/migrate/types';
import {
	computeBalance,
	getMonthKey,
	RENT_MONTH_PATTERN,
	type YearHistory
} from '../src/lib/server/payments';

type Link = { tenantId: string; moveInMonth?: string };

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Turns each property's tenant links (`junction_user_property`) into one lease, so the lease-based
 * app finds every existing tenant with the same rent and payment history.
 */
const migration: Migration = {
	name: '0001-leases-from-tenant-links',
	description:
		"Create one lease per property from its tenant links (property rent, earliest move-in month, no end date) and copy the property's payment history and recorded invoices to it.",
	undo: [
		'1. Delete every leases/migrated-{propertyId} document together with its payment_history and recorded_invoices subcollections.',
		'2. Delete _migrations/0001-leases-from-tenant-links.',
		'The junction_user_property documents and the properties/{id}/payment_history documents are not changed, so the previous app version works again once deployed.',
		'Payments recorded on a migrated lease after the deploy exist only on the lease: copy them back to properties/{id}/payment_history before step 1.'
	].join('\n'),

	async up({ db, now, log, write }) {
		const links = new Map<string, Link[]>();
		for (const doc of (await db.collection('junction_user_property').get()).docs) {
			const { tenantId, propertyId, moveInMonth } = doc.data();
			if (typeof tenantId !== 'string' || typeof propertyId !== 'string') continue;
			links.set(propertyId, [...(links.get(propertyId) ?? []), { tenantId, moveInMonth }]);
		}

		const created: string[] = [];
		const skipped: string[] = [];
		const balanceChanges: string[] = [];
		const currentMonth = getMonthKey(now).key;

		for (const [propertyId, propertyLinks] of [...links].sort(([a], [b]) => a.localeCompare(b))) {
			const propertyRef = db.collection('properties').doc(propertyId);
			const property = (await propertyRef.get()).data();
			if (!property) {
				skipped.push(`${propertyId}: property does not exist`);
				continue;
			}

			const tenants: Link[] = [];
			for (const link of propertyLinks) {
				const user = (await db.collection('users').doc(link.tenantId).get()).data();
				if (!user) skipped.push(`${propertyId}: tenant ${link.tenantId} does not exist`);
				else if (user.permissions === 'admin') {
					skipped.push(`${propertyId}: ${link.tenantId} is an admin`);
				} else tenants.push(link);
			}
			if (tenants.length === 0) {
				skipped.push(`${propertyId}: no tenants left to put on a lease`);
				continue;
			}

			const months = tenants
				.map((t) => t.moveInMonth)
				.filter((m): m is string => typeof m === 'string' && RENT_MONTH_PATTERN.test(m))
				.sort();
			// Like the old balance: no move-in month means rent counts from the current month.
			const startMonth = months[0] ?? currentMonth;
			const leaseId = `migrated-${propertyId}`;
			const leaseRef = db.collection('leases').doc(leaseId);

			const [history, invoices] = await Promise.all([
				propertyRef.collection('payment_history').get(),
				propertyRef.collection('recorded_invoices').get()
			]);

			// The balance each tenant owed before and owes after: they differ only for a tenant whose
			// move-in month was later than a housemate's.
			const histories: Record<string, YearHistory> = Object.fromEntries(
				history.docs.map((doc) => [doc.id, doc.data() as YearHistory])
			);
			for (const tenant of tenants) {
				const before = computeBalance({
					rent: property.rent,
					startMonth: tenant.moveInMonth,
					histories,
					now
				}).balanceCents;
				const after = computeBalance({
					rent: property.rent,
					startMonth,
					histories,
					now
				}).balanceCents;
				log(
					`${leaseId}: tenant ${tenant.tenantId} owes ${dollars(before)} before, ${dollars(after)} after`
				);
				if (before !== after) {
					balanceChanges.push(`${tenant.tenantId}: ${dollars(before)} -> ${dollars(after)}`);
				}
			}

			// A re-run keeps a lease that already exists (it may have been edited since) and copies the
			// history again with the same document ids, which changes nothing.
			if (!(await leaseRef.get()).exists) {
				const lease: DocumentData = {
					propertyId,
					tenantIds: tenants.map((t) => t.tenantId),
					rent: property.rent,
					startDate: `${startMonth}-01`,
					endDate: null,
					document: null,
					createdAt: now.toISOString(),
					updatedAt: now.toISOString(),
					migratedFrom: 'junction_user_property'
				};
				await write.set(leaseRef, lease);
			}
			for (const doc of history.docs) {
				await write.set(leaseRef.collection('payment_history').doc(doc.id), doc.data());
			}
			for (const doc of invoices.docs) {
				await write.set(leaseRef.collection('recorded_invoices').doc(doc.id), doc.data());
			}
			created.push(
				`${leaseId} (${tenants.length} tenant(s), ${history.size} history and ${invoices.size} invoice document(s))`
			);
		}

		return { leases: created, skipped, balanceChanges };
	}
};

export default migration;
