import type {
	CollectionReference,
	DocumentReference,
	DocumentSnapshot,
	QuerySnapshot
} from 'firebase-admin/firestore';
import { adminDB } from './admin';
import {
	computeLedger,
	ledgerYears,
	type DepositLedger,
	type HistoryYear,
	type LateFeeRecord,
	type Ledger,
	type LeaseTerms
} from './billing';

/** Where a lease's deposit payments and settlement are kept. */
export const depositRef = (leaseRef: DocumentReference) =>
	leaseRef.collection('deposit').doc('ledger');

export type LedgerReader = {
	doc: (ref: DocumentReference) => Promise<DocumentSnapshot>;
	collection: (ref: CollectionReference) => Promise<QuerySnapshot>;
};

const directReader: LedgerReader = {
	doc: (ref) => ref.get(),
	collection: (ref) => ref.get()
};

/** The stored records a lease's ledger is computed from. */
export type LedgerRecords = {
	histories: Record<string, HistoryYear>;
	lateFees: Record<string, LateFeeRecord | undefined>;
	deposit: DepositLedger | undefined;
};

/**
 * Reads the `payment_history` years, `late_fees` and the deposit ledger of a lease. A transaction
 * passes its own reader so that the reads are part of it.
 */
export async function loadLedgerRecords(
	leaseRef: DocumentReference,
	lease: Pick<LeaseTerms, 'startDate' | 'endDate'>,
	now: Date,
	read: LedgerReader = directReader
): Promise<LedgerRecords> {
	const years = ledgerYears(lease, now);
	const [historyDocs, lateFeeDocs, deposit] = await Promise.all([
		Promise.all(years.map((year) => read.doc(leaseRef.collection('payment_history').doc(year)))),
		read.collection(leaseRef.collection('late_fees')),
		read.doc(depositRef(leaseRef))
	]);
	return {
		histories: Object.fromEntries(
			years.map((year, index) => [year, historyDocs[index].data() as HistoryYear])
		),
		lateFees: Object.fromEntries(
			lateFeeDocs.docs.map((doc) => [doc.id, doc.data() as LateFeeRecord])
		),
		deposit: deposit.data() as DepositLedger | undefined
	};
}

/** Reads what a lease's ledger depends on and computes it. */
export async function loadLeaseLedger(
	leaseId: string,
	lease: LeaseTerms,
	now = new Date()
): Promise<Ledger> {
	const records = await loadLedgerRecords(adminDB.collection('leases').doc(leaseId), lease, now);
	return computeLedger({ lease, ...records, now });
}
