import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';
import { adminDB } from './admin';
import { loadLedgerRecords } from './balance';
import {
	addDays,
	computeLedger,
	PAYABLE_DAYS_BEFORE_DUE,
	type LateFeeRecord,
	type Ledger
} from './billing';
import { sendEmail } from './email';
import { renderDueReminderEmail, renderLateFeeEmail, type EmailContent } from './email-templates';
import { businessToday, leaseStatus, type LeaseDoc } from './leaseDates';
import { propertyAddress } from './leases';

/**
 * The daily billing job: charges late fees for months that became late, emails a notice for each
 * fee charged, and emails due-date reminders 7 days before and on the due date. It is safe to run
 * again: fees are created only when missing, and every email is recorded once sent.
 */

const LOCK_MINUTES = 10;
/** A late-fee notice that keeps failing is given up after this many days. */
const NOTICE_RETRY_DAYS = 7;

const jobRef = () => adminDB.collection('_jobs').doc('daily');

export type ChargedFee = { leaseId: string; month: string; amount: number };
export type JobSummary = {
	date: string;
	startedAt: string;
	finishedAt: string;
	runBy: string;
	leases: number;
	feesCharged: ChargedFee[];
	emailsSent: { leaseId: string; notice: string; to: string }[];
	errors: string[];
};

export type JobResult = { kind: 'busy' } | { kind: 'done'; summary: JobSummary };

async function takeLock(now: Date, runBy: string): Promise<boolean> {
	return adminDB.runTransaction(async (tx) => {
		const lock = (await tx.get(jobRef())).data() as { lockedUntil?: string } | undefined;
		if (lock?.lockedUntil && lock.lockedUntil > now.toISOString()) return false;
		tx.set(
			jobRef(),
			{
				lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString(),
				lockedBy: runBy
			},
			{ merge: true }
		);
		return true;
	});
}

const releaseLock = () => jobRef().set({ lockedUntil: null }, { merge: true });

const monthLabel = (month: { monthName: string; year: number }) =>
	`${month.monthName} ${month.year}`;

/** Charges every late month of a lease that has no fee yet, in one transaction. */
async function chargeLateFees(
	leaseRef: DocumentReference,
	now: Date
): Promise<{ lease: LeaseDoc; ledger: Ledger; charged: ChargedFee[] } | undefined> {
	return adminDB.runTransaction(async (tx) => {
		const lease = (await tx.get(leaseRef)).data() as LeaseDoc | undefined;
		if (!lease) return undefined;
		const records = await loadLedgerRecords(leaseRef, {
			doc: (ref) => tx.get(ref),
			collection: (ref) => tx.get(ref)
		});
		const before = computeLedger({ lease, ...records, now });
		const charged: ChargedFee[] = [];
		const lateFees = { ...records.lateFees };
		for (const fee of before.unchargedLateFees) {
			const record: LateFeeRecord = {
				amount: fee.amountCents / 100,
				paid: 0,
				chargedAt: now.toISOString(),
				chargedBy: 'daily-job',
				dueDate: fee.dueDate
			};
			tx.set(leaseRef.collection('late_fees').doc(fee.month.key), record, { merge: true });
			lateFees[fee.month.key] = record;
			charged.push({ leaseId: leaseRef.id, month: fee.month.key, amount: record.amount });
		}
		const ledger = charged.length ? computeLedger({ lease, ...records, lateFees, now }) : before;
		return { lease, ledger, charged };
	});
}

type Notice = { key: string; content: EmailContent };

/** The emails a lease is due today, before removing those already sent. */
function noticesFor(
	lease: LeaseDoc,
	ledger: Ledger,
	address: string,
	lateFeeRecords: Record<string, LateFeeRecord>
): Notice[] {
	const link = `${PUBLIC_FRONTEND_URL}/payment`;
	const today = ledger.today;
	const notices: Notice[] = [];

	// Late-fee notices, for fees the job charged; retried for a few days if sending failed.
	for (const fee of ledger.lateFees) {
		const record = lateFeeRecords[fee.month.key];
		if (!record?.chargedAt || fee.waived) continue;
		const chargedDay = businessToday(new Date(record.chargedAt));
		if (addDays(chargedDay, NOTICE_RETRY_DAYS) < today) continue;
		notices.push({
			key: `late-fee-${fee.month.key}`,
			content: renderLateFeeEmail({
				address,
				monthLabel: monthLabel(fee.month),
				feeCents: fee.amountCents,
				totalOwedCents: ledger.totalCents,
				link
			})
		});
	}

	// Reminders: only on their own day, only while the amount is unpaid, never for an ended lease.
	if (leaseStatus(lease, today) === 'ended') return notices;
	const reminderDay = (dueDate: string) =>
		dueDate === today
			? 'due'
			: addDays(dueDate, -PAYABLE_DAYS_BEFORE_DUE) === today
				? '7d'
				: undefined;
	for (const row of ledger.rent) {
		const day = reminderDay(row.dueDate);
		if (!day || row.owedCents <= 0) continue;
		notices.push({
			key: `rent-${day}-${row.month.key}`,
			content: renderDueReminderEmail({
				address,
				what: `Rent for ${monthLabel(row.month)}`,
				amountCents: row.owedCents,
				dueDate: row.dueDate,
				dueToday: day === 'due',
				link
			})
		});
	}
	const deposit = ledger.deposit;
	const depositDay = deposit.dueDate ? reminderDay(deposit.dueDate) : undefined;
	if (depositDay && deposit.owedCents > 0) {
		notices.push({
			key: `deposit-${depositDay}-${deposit.dueDate}`,
			content: renderDueReminderEmail({
				address,
				what: 'Security deposit',
				amountCents: deposit.owedCents,
				dueDate: deposit.dueDate!,
				dueToday: depositDay === 'due',
				link
			})
		});
	}
	return notices;
}

export async function runDailyJob(now = new Date(), runBy = 'scheduler'): Promise<JobResult> {
	if (!(await takeLock(now, runBy))) return { kind: 'busy' };
	const summary: JobSummary = {
		date: businessToday(now),
		startedAt: now.toISOString(),
		finishedAt: '',
		runBy,
		leases: 0,
		feesCharged: [],
		emailsSent: [],
		errors: []
	};
	try {
		const leaseDocs = (await adminDB.collection('leases').get()).docs;
		for (const doc of leaseDocs) {
			try {
				const result = await chargeLateFees(doc.ref, now);
				if (!result) continue;
				summary.leases++;
				summary.feesCharged.push(...result.charged);
				await sendNotices(doc.ref, result.lease, result.ledger, summary);
			} catch (err) {
				summary.errors.push(`lease ${doc.id}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	} finally {
		summary.finishedAt = new Date().toISOString();
		await adminDB
			.collection('_jobs')
			.doc('daily')
			.collection('runs')
			.doc(summary.date)
			.set({ runs: FieldValue.arrayUnion(summary), lastRunAt: summary.finishedAt }, { merge: true })
			.catch((err) => console.error('Could not store the daily job summary', err));
		await releaseLock().catch((err) => console.error('Could not release the daily job lock', err));
	}
	if (summary.errors.length > 0) {
		console.error(`Daily billing job finished with errors: ${summary.errors.join('; ')}`);
	}
	return { kind: 'done', summary };
}

/** Sends each tenant on the lease every notice due today that they have not been sent yet. */
async function sendNotices(
	leaseRef: DocumentReference,
	lease: LeaseDoc,
	ledger: Ledger,
	summary: JobSummary
) {
	const [property, lateFeeDocs, sentDocs] = await Promise.all([
		adminDB.collection('properties').doc(lease.propertyId).get(),
		leaseRef.collection('late_fees').get(),
		leaseRef.collection('notices').get()
	]);
	const lateFeeRecords = Object.fromEntries(
		lateFeeDocs.docs.map((d) => [d.id, d.data() as LateFeeRecord])
	);
	const notices = noticesFor(lease, ledger, propertyAddress(property.data()), lateFeeRecords);
	if (notices.length === 0) return;

	const sent = new Set(sentDocs.docs.map((d) => d.id));
	const tenants = await Promise.all(
		lease.tenantIds.map(async (uid) => ({
			uid,
			email: (await adminDB.collection('users').doc(uid).get()).data()?.email as string | undefined
		}))
	);
	for (const notice of notices) {
		for (const tenant of tenants) {
			const id = `${notice.key}-${tenant.uid}`;
			if (sent.has(id) || !tenant.email) continue;
			try {
				await sendEmail({ to: tenant.email, ...notice.content });
			} catch (err) {
				summary.errors.push(
					`lease ${leaseRef.id}: ${notice.key} to ${tenant.uid}: ${err instanceof Error ? err.message : String(err)}`
				);
				continue;
			}
			await leaseRef
				.collection('notices')
				.doc(id)
				.set({ notice: notice.key, uid: tenant.uid, sentAt: new Date().toISOString() });
			summary.emailsSent.push({ leaseId: leaseRef.id, notice: notice.key, to: tenant.uid });
		}
	}
}
