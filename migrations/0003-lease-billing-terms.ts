import type { Migration } from '../scripts/migrate/types';
import { defaultLateFee } from '../src/lib/server/billing';
import { businessToday } from '../src/lib/server/leaseDates';

/**
 * Gives every lease created before deposits and late fees existed its billing terms: no deposit,
 * a late fee of 5% of rent, 5 grace days, and late fees only for months due from today on, so months
 * that were already late are never charged a fee. Payment history is not touched; proration of
 * existing leases comes from the billing rules, not from this migration.
 */
const migration: Migration = {
	name: '0003-lease-billing-terms',
	description:
		'Set deposit null, lateFee 5% of rent, graceDays 5 and lateFeesFrom (the run date) on leases without a lateFee.',
	undo: [
		'1. Redeploy the app version from before this change.',
		'2. For each lease id in the summary (updated), delete the fields deposit, lateFee, graceDays and lateFeesFrom.',
		'3. Delete _migrations/0003-lease-billing-terms.',
		'Deposit or late-fee payments recorded after this migration (leases/{id}/deposit and leases/{id}/late_fees) are invisible to the old app and must be accounted for by hand.'
	].join('\n'),

	async up({ db, now, log, write }) {
		const today = businessToday(now);
		const updated: string[] = [];
		const skipped: string[] = [];
		for (const doc of (await db.collection('leases').get()).docs) {
			const lease = doc.data();
			if (typeof lease.lateFee === 'number') {
				skipped.push(doc.id);
				continue;
			}
			if (typeof lease.rent !== 'number') {
				// Not a lease the app wrote (0002 archived the known ones); leave it for a person.
				log(`WARNING: leases/${doc.id} has no numeric rent; skipped`);
				skipped.push(doc.id);
				continue;
			}
			const lateFee = defaultLateFee(lease.rent);
			await write.set(
				doc.ref,
				{ deposit: null, lateFee, graceDays: 5, lateFeesFrom: today },
				{ merge: true }
			);
			log(
				`leases/${doc.id}: late fee ${lateFee.toFixed(2)}, 5 grace days, late fees from ${today}`
			);
			updated.push(doc.id);
		}
		return { updated, skipped, lateFeesFrom: today };
	}
};

export default migration;
