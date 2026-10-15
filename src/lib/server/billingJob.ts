import { randomUUID } from 'node:crypto';
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
	/** Things a retry cannot fix (a tenant with no email address); they do not fail the run. */
	warnings: string[];
};

export type JobResult = { kind: 'busy' } | { kind: 'done'; summary: JobSummary };

async function takeLock(now: Date, token: string): Promise<boolean> {
	return adminDB.runTransaction(async (tx) => {
		const lock = (await tx.get(jobRef())).data() as { lockedUntil?: string } | undefined;
		if (lock?.lockedUntil && lock.lockedUntil > now.toISOString()) return false;
		tx.set(
			jobRef(),
			{
				lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString(),
				lockedBy: token
			},
			{ merge: true }
		);
		return true;
	});
}

/** Moves the lock's expiry (or clears it), only while this run still holds it. */
const updateOwnLock = (token: string, lockedUntil: string | null) =>
	adminDB.runTransaction(async (tx) => {
		const lock = (await tx.get(jobRef())).data() as { lockedBy?: string } | undefined;
		if (lock?.lockedBy === token) tx.set(jobRef(), { lockedUntil }, { merge: true });
	});

const extendLock = (token: string) =>
	updateOwnLock(token, new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString());

const releaseLock = (token: string) => updateOwnLock(token, null);

const monthLabel = (month: { monthName: string; year: number }) =>
	`${month.monthName} ${month.year}`;

/** Charges every late month of a lease that has no fee yet, in one transaction. */
async function chargeLateFees(
	leaseRef: DocumentReference,
	now: Date
): Promise<
	| {
			lease: LeaseDoc;
			ledger: Ledger;
			charged: ChargedFee[];
			lateFees: Record<string, LateFeeRecord>;
	  }
	| undefined
> {
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
		return { lease, ledger, charged, lateFees: lateFees as Record<string, LateFeeRecord> };
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
	const token = `${runBy}:${randomUUID()}`;
	if (!(await takeLock(now, token))) return { kind: 'busy' };
	const summary: JobSummary = {
		date: businessToday(now),
		startedAt: now.toISOString(),
		finishedAt: '',
		runBy,
		leases: 0,
		feesCharged: [],
		emailsSent: [],
		errors: [],
		warnings: []
	};
	try {
		const leaseDocs = (await adminDB.collection('leases').get()).docs;
		for (const doc of leaseDocs) {
			try {
				const result = await chargeLateFees(doc.ref, now);
				if (!result) continue;
				summary.leases++;
				summary.feesCharged.push(...result.charged);
				await sendNotices(doc.ref, result, summary, now);
			} catch (err) {
				summary.errors.push(`lease ${doc.id}: ${err instanceof Error ? err.message : String(err)}`);
			}
			// A long run keeps its lock, so a scheduler retry does not start a second run meanwhile.
			await extendLock(token).catch(() => undefined);
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
		await releaseLock(token).catch((err) =>
			console.error('Could not release the daily job lock', err)
		);
	}
	if (summary.errors.length > 0) {
		console.error(`Daily billing job finished with errors: ${summary.errors.join('; ')}`);
	}
	return { kind: 'done', summary };
}

/** A claimed notice that was never sent (the run died before sending) can be claimed again. */
const isStaleClaim = (data: { sentAt?: string; claimedAt?: string }, now: Date) =>
	!data.sentAt &&
	(!data.claimedAt ||
		data.claimedAt < new Date(now.getTime() - LOCK_MINUTES * 60_000).toISOString());

/** Sends each tenant on the lease every notice due today that they have not been sent yet. */
async function sendNotices(
	leaseRef: DocumentReference,
	charged: { lease: LeaseDoc; ledger: Ledger; lateFees: Record<string, LateFeeRecord> },
	summary: JobSummary,
	now: Date
) {
	const { lease, ledger } = charged;
	// Which notices are due does not depend on the address, so the reads below happen only when
	// there is something to send.
	if (noticesFor(lease, ledger, '', charged.lateFees).length === 0) return;
	const [leaseNow, property, sentDocs] = await Promise.all([
		leaseRef.get(),
		adminDB.collection('properties').doc(lease.propertyId).get(),
		leaseRef.collection('notices').get()
	]);
	// The lease may have been deleted since its fees were charged.
	if (!leaseNow.exists) return;
	const notices = noticesFor(lease, ledger, propertyAddress(property.data()), charged.lateFees);

	const sent = new Set(
		sentDocs.docs
			.filter((d) => !isStaleClaim(d.data() as { sentAt?: string; claimedAt?: string }, now))
			.map((d) => d.id)
	);
	const stale = new Set(sentDocs.docs.map((d) => d.id).filter((id) => !sent.has(id)));
	const tenants = await Promise.all(
		lease.tenantIds.map(async (uid) => ({
			uid,
			email: (await adminDB.collection('users').doc(uid).get()).data()?.email as string | undefined
		}))
	);
	const fail = (what: string, err: unknown) =>
		summary.errors.push(
			`lease ${leaseRef.id}: ${what}: ${err instanceof Error ? err.message : String(err)}`
		);
	for (const tenant of tenants.filter((t) => !t.email)) {
		summary.warnings.push(`lease ${leaseRef.id}: tenant ${tenant.uid} has no email address`);
	}
	for (const notice of notices) {
		for (const tenant of tenants) {
			const id = `${notice.key}-${tenant.uid}`;
			if (sent.has(id) || !tenant.email) continue;
			// Claim the notice before sending: `create` fails if another run already claimed it, so a
			// second run (an overlapping retry) can never send the same email twice.
			const claim = leaseRef.collection('notices').doc(id);
			try {
				if (stale.has(id)) await claim.delete();
				await claim.create({ notice: notice.key, uid: tenant.uid, claimedAt: now.toISOString() });
			} catch {
				continue;
			}
			try {
				await sendEmail({ to: tenant.email, ...notice.content });
			} catch (err) {
				fail(`${notice.key} to ${tenant.uid}`, err);
				// Unclaimed again, so the next run retries it.
				await claim.delete().catch((e) => fail(`releasing ${id}`, e));
				continue;
			}
			await claim
				.set({ sentAt: new Date().toISOString() }, { merge: true })
				.catch((e) => fail(`recording ${id}`, e));
			summary.emailsSent.push({ leaseId: leaseRef.id, notice: notice.key, to: tenant.uid });
		}
	}
}
