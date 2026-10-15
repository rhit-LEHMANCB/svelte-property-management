import type { CollectionReference, DocumentReference, Transaction } from 'firebase-admin/firestore';
import { adminDB } from './admin';
import { depositRef, loadLedgerRecords } from './balance';
import { computeLedger, toCents, type Deduction, type Settlement } from './billing';
import { leaseStatus, type LeaseDoc } from './leaseDates';

const MONTH_KEY = /^20\d{2}-(0[1-9]|1[0-2])$/;

const readerFor = (tx: Transaction) => ({
	doc: (ref: DocumentReference) => tx.get(ref),
	collection: (ref: CollectionReference) => tx.get(ref)
});

/**
 * Waives the late fee of one month (`YYYY-MM`): whatever of it is unpaid stops being owed; anything
 * already paid toward it stays recorded. Waiving twice changes nothing.
 */
export async function waiveLateFee(
	leaseId: string,
	month: string,
	adminId: string,
	now = new Date()
): Promise<'waived' | 'missing-lease' | 'no-fee'> {
	if (!MONTH_KEY.test(month)) return 'no-fee';
	const leaseRef = adminDB.collection('leases').doc(leaseId);
	return adminDB.runTransaction(async (tx) => {
		const lease = (await tx.get(leaseRef)).data() as LeaseDoc | undefined;
		if (!lease) return 'missing-lease';
		const records = await loadLedgerRecords(leaseRef, lease, now, readerFor(tx));
		const fee = computeLedger({ lease, ...records, now }).lateFees.find(
			(f) => f.month.key === month
		);
		if (!fee) return 'no-fee';
		if (fee.waived) return 'waived';
		tx.set(
			leaseRef.collection('late_fees').doc(month),
			{
				amount: fee.amountCents / 100,
				paid: fee.paidCents / 100,
				waivedAt: now.toISOString(),
				waivedBy: adminId
			},
			{ merge: true }
		);
		return 'waived';
	});
}

export type SettlementInput = { returned: unknown; deductions: unknown };

export type SettleResult =
	| { kind: 'settled'; settlement: Settlement }
	| { kind: 'missing-lease' }
	| { kind: 'not-ended' }
	| {
			kind: 'invalid';
			errors: { returned?: string; deductions?: Record<number, string>; total?: string };
	  };

const isAmount = (value: unknown, allowZero: boolean): value is number =>
	typeof value === 'number' &&
	Number.isFinite(value) &&
	(allowZero ? value >= 0 : value > 0) &&
	Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

/**
 * Records (or replaces) the settlement of a lease's deposit once the lease has ended: the amount
 * returned and the deductions kept, which together must equal the deposit paid.
 */
export async function settleDeposit(
	leaseId: string,
	input: SettlementInput,
	adminId: string,
	now = new Date()
): Promise<SettleResult> {
	const errors: { returned?: string; deductions?: Record<number, string>; total?: string } = {};
	if (!isAmount(input.returned, true)) {
		errors.returned = 'Enter the amount returned, 0 or more, with at most two decimals.';
	}
	const rawDeductions = Array.isArray(input.deductions) ? input.deductions : null;
	if (!rawDeductions) errors.total = 'Deductions must be a list.';
	const deductions: Deduction[] = [];
	(rawDeductions ?? []).forEach((raw, index) => {
		const { amount, reason } = (raw ?? {}) as { amount?: unknown; reason?: unknown };
		const text = typeof reason === 'string' ? reason.trim() : '';
		if (!isAmount(amount, false)) {
			(errors.deductions ??= {})[index] =
				'Each deduction needs an amount greater than 0 with at most two decimals.';
		} else if (text === '') {
			(errors.deductions ??= {})[index] = 'Each deduction needs a reason.';
		} else if (text.length > 500) {
			(errors.deductions ??= {})[index] = 'A reason can be at most 500 characters.';
		} else {
			deductions.push({ amount, reason: text });
		}
	});
	if (Object.keys(errors).length > 0) return { kind: 'invalid', errors };

	const leaseRef = adminDB.collection('leases').doc(leaseId);
	return adminDB.runTransaction(async (tx): Promise<SettleResult> => {
		const lease = (await tx.get(leaseRef)).data() as LeaseDoc | undefined;
		if (!lease) return { kind: 'missing-lease' };
		const records = await loadLedgerRecords(leaseRef, lease, now, readerFor(tx));
		const ledger = computeLedger({ lease, ...records, now });
		if (leaseStatus(lease, ledger.today) !== 'ended') return { kind: 'not-ended' };

		if (ledger.deposit.paidCents === 0) {
			return { kind: 'invalid', errors: { total: 'No deposit has been paid on this lease.' } };
		}
		const returned = input.returned as number;
		const total = toCents(returned) + deductions.reduce((s, d) => s + toCents(d.amount), 0);
		if (total !== ledger.deposit.paidCents) {
			return {
				kind: 'invalid',
				errors: {
					total: `Returned and kept must add up to the deposit paid, ${(ledger.deposit.paidCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.`
				}
			};
		}
		const settlement: Settlement = {
			returned,
			deductions,
			recordedAt: now.toISOString(),
			recordedBy: adminId
		};
		tx.set(depositRef(leaseRef), { settlement }, { merge: true });
		return { kind: 'settled', settlement };
	});
}
