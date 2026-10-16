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
import {
	MAX_ATTEMPTS,
	autopayFeeCents,
	inFlightCents,
	methodLabel,
	projectedSplit,
	type ChargeRecord,
	type Enrollment
} from './autopay';
import { chargeAutopay, hasPendingCharge, type AutopayCharge } from './autopayCharge';
import { loadCharges, loadEnrollments } from './autopayStore';
import { sendEmail } from './email';
import {
	renderAutopayFailedEmail,
	renderAutopayGaveUpEmail,
	renderAutopayNoticeEmail,
	renderDueReminderEmail,
	renderLateFeeEmail,
	type EmailContent,
	type ReminderItem
} from './email-templates';
import { businessToday, leaseStatus, type LeaseDoc } from './leaseDates';
import { propertyAddress } from './leases';

/**
 * The daily billing job: charges late fees for months that became late, charges autopay for leases
 * with money due, emails a notice for each fee charged and each autopay failure, and emails due-date
 * reminders 7 days before and on the due date (autopay tenants get one autopay notice instead). It
 * is safe to run again: fees are created only when missing, autopay charges are claimed once per
 * due date, tenant and attempt, and every email is recorded once sent.
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
	autopayCharges: AutopayCharge[];
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
		// While an autopay charge is settling (ACH takes days), the lease is not charged late fees. Once
		// it settles, the payment is dated when the charge started; if it fails, fees resume next run.
		const autopayPending = await hasPendingCharge(leaseRef, (query) => tx.get(query));
		for (const fee of autopayPending ? [] : before.unchargedLateFees) {
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

type LateFeeNotice = { key: string; content: EmailContent };
type Reminder = { key: string; item: ReminderItem };
/** An autopay email to one tenant: the 7-day notice, a failure or a give-up. */
type AutopayNotice = { key: string; uid: string; content: EmailContent };
type Notices = {
	lateFees: LateFeeNotice[];
	reminders: Reminder[];
	autopay: AutopayNotice[];
	/**
	 * Tenants autopay will charge, who get the autopay notice instead of the reminders. A tenant with
	 * autopay on whom earlier tenants' amounts leave nothing to pay keeps the usual reminders.
	 */
	enrolled: string[];
};

/** A lease's autopay state, for the notices. */
type AutopayContext = { enrollments: Enrollment[]; charges: ChargeRecord[] };

/** The emails a lease is due today, before removing those already sent. */
function noticesFor(
	lease: LeaseDoc,
	ledger: Ledger,
	address: string,
	lateFeeRecords: Record<string, LateFeeRecord>,
	autopay: AutopayContext
): Notices {
	const link = `${PUBLIC_FRONTEND_URL}/payment`;
	const today = ledger.today;
	const enrollments = autopay.enrollments.filter((e) => lease.tenantIds.includes(e.uid));
	// Charges already made count toward each tenant's share, so a tenant charged today but not yet
	// recorded is not reminded of what they just paid.
	const shares = projectedSplit(ledger.totalCents, enrollments);
	const notices: Notices = {
		lateFees: [],
		reminders: [],
		autopay: [],
		enrolled: enrollments.filter((e) => (shares.get(e.uid) ?? 0) > 0).map((e) => e.uid)
	};
	const recent = (day: string | null | undefined) =>
		Boolean(day) && addDays(day!, NOTICE_RETRY_DAYS) >= today;

	// Autopay failures and give-ups, to the tenant whose charge it was; retried for a few days.
	for (const charge of autopay.charges) {
		const enrollment = autopay.enrollments.find((e) => e.uid === charge.uid);
		const method = enrollment ? methodLabel(enrollment) : 'saved payment method';
		for (const failure of charge.failures ?? []) {
			if (failure.attempt >= MAX_ATTEMPTS || !recent(failure.day)) continue;
			notices.autopay.push({
				key: `autopay-failed-${charge.cycleKey}-${failure.attempt}`,
				uid: charge.uid,
				content: renderAutopayFailedEmail({
					address,
					amountCents: failure.amountCents,
					method,
					reason: failure.error,
					link
				})
			});
		}
		if (charge.state === 'gave-up' && recent(charge.gaveUpDay)) {
			notices.autopay.push({
				key: `autopay-gave-up-${charge.cycleKey}`,
				uid: charge.uid,
				content: renderAutopayGaveUpEmail({
					address,
					amountCents: charge.amountCents,
					method,
					reason: charge.error ?? 'the payment was declined',
					link
				})
			});
		}
	}

	// Late-fee notices, for fees the job charged; retried for a few days if sending failed.
	for (const fee of ledger.lateFees) {
		const record = lateFeeRecords[fee.month.key];
		if (!record?.chargedAt || fee.waived) continue;
		const chargedDay = businessToday(new Date(record.chargedAt));
		if (addDays(chargedDay, NOTICE_RETRY_DAYS) < today) continue;
		notices.lateFees.push({
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
	// Autopay tenants get one autopay notice 7 days before a due date instead of the reminders.
	const autopayDue = new Map<string, string[]>();
	const addAutopayDue = (dueDate: string, what: string) =>
		autopayDue.set(dueDate, [...(autopayDue.get(dueDate) ?? []), what]);
	for (const row of ledger.rent) {
		const day = reminderDay(row.dueDate);
		if (!day || row.owedCents <= 0) continue;
		if (day === '7d') addAutopayDue(row.dueDate, `Rent for ${monthLabel(row.month)}`);
		notices.reminders.push({
			key: `rent-${day}-${row.month.key}`,
			item: {
				what: `Rent for ${monthLabel(row.month)}`,
				amountCents: row.owedCents,
				dueDate: row.dueDate,
				dueToday: day === 'due'
			}
		});
	}
	const deposit = ledger.deposit;
	const depositDay = deposit.dueDate ? reminderDay(deposit.dueDate) : undefined;
	if (depositDay && deposit.owedCents > 0) {
		if (depositDay === '7d') addAutopayDue(deposit.dueDate!, 'Security deposit');
		notices.reminders.push({
			key: `deposit-${depositDay}-${deposit.dueDate}`,
			item: {
				what: 'Security deposit',
				amountCents: deposit.owedCents,
				dueDate: deposit.dueDate!,
				dueToday: depositDay === 'due'
			}
		});
	}
	if (autopayDue.size > 0 && enrollments.length > 0) {
		const split = projectedSplit(
			Math.max(0, ledger.totalCents - inFlightCents(autopay.charges)),
			enrollments
		);
		for (const [dueDate, what] of autopayDue) {
			for (const enrollment of enrollments) {
				const cents = split.get(enrollment.uid) ?? 0;
				if (cents <= 0) continue;
				const feeCents = autopayFeeCents(enrollment.type, cents);
				notices.autopay.push({
					key: `autopay-7d-${dueDate}`,
					uid: enrollment.uid,
					content: renderAutopayNoticeEmail({
						address,
						what: what.join(' and '),
						amountCents: cents + feeCents,
						feeCents,
						dueDate,
						method: methodLabel(enrollment),
						link
					})
				});
			}
		}
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
		autopayCharges: [],
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
				let ledger = result.ledger;
				try {
					const autopay = await chargeAutopay(doc.ref, now, token);
					summary.autopayCharges.push(...autopay.charges);
					summary.warnings.push(...autopay.warnings);
					if (autopay.charges.length > 0) {
						// Paid charges may be recorded already; reminders go by what is owed now.
						const records = await loadLedgerRecords(doc.ref);
						ledger = computeLedger({ lease: result.lease, ...records, now });
					}
				} catch (err) {
					// Declines are not errors; this is Stripe or Firestore failing. The claim is continued
					// by a later run, and the lease's notices still go out.
					summary.errors.push(
						`lease ${doc.id}: autopay: ${err instanceof Error ? err.message : String(err)}`
					);
				}
				const [enrollments, charges] = await Promise.all([
					loadEnrollments(doc.ref),
					loadCharges(doc.ref)
				]);
				await sendNotices(doc.ref, { ...result, ledger }, { enrollments, charges }, summary, now);
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
	autopay: AutopayContext,
	summary: JobSummary,
	now: Date
) {
	const { lease, ledger } = charged;
	// Which notices are due does not depend on the address, so the reads below happen only when
	// there is something to send.
	const due = noticesFor(lease, ledger, '', charged.lateFees, autopay);
	if (due.lateFees.length === 0 && due.reminders.length === 0 && due.autopay.length === 0) return;
	const [leaseNow, property, sentDocs] = await Promise.all([
		leaseRef.get(),
		adminDB.collection('properties').doc(lease.propertyId).get(),
		leaseRef.collection('notices').get()
	]);
	// The lease may have been deleted since its fees were charged.
	if (!leaseNow.exists) return;
	const address = propertyAddress(property.data());
	const notices = noticesFor(lease, ledger, address, charged.lateFees, autopay);
	const link = `${PUBLIC_FRONTEND_URL}/payment`;

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

	/**
	 * Claims each notice not yet sent to the tenant, then sends one email for the claimed ones.
	 * `create` fails if another run already claimed a notice, so a second run (an overlapping
	 * retry) can never send the same notice twice.
	 */
	const sendOnce = async <T extends { key: string }>(
		tenant: { uid: string; email: string },
		group: T[],
		render: (claimed: T[]) => EmailContent
	) => {
		const claimed: { notice: T; ref: DocumentReference }[] = [];
		for (const notice of group) {
			const id = `${notice.key}-${tenant.uid}`;
			if (sent.has(id)) continue;
			const ref = leaseRef.collection('notices').doc(id);
			try {
				if (stale.has(id)) await ref.delete();
				await ref.create({ notice: notice.key, uid: tenant.uid, claimedAt: now.toISOString() });
				claimed.push({ notice, ref });
			} catch {
				continue;
			}
		}
		if (claimed.length === 0) return;
		const keys = claimed.map((c) => c.notice.key).join('+');
		try {
			await sendEmail({ to: tenant.email, ...render(claimed.map((c) => c.notice)) });
		} catch (err) {
			fail(`${keys} to ${tenant.uid}`, err);
			// Unclaimed again, so the next run retries them.
			for (const { ref } of claimed) {
				await ref.delete().catch((e) => fail(`releasing ${ref.id}`, e));
			}
			return;
		}
		const sentAt = new Date().toISOString();
		for (const { ref } of claimed) {
			await ref.set({ sentAt }, { merge: true }).catch((e) => fail(`recording ${ref.id}`, e));
		}
		summary.emailsSent.push({ leaseId: leaseRef.id, notice: keys, to: tenant.uid });
	};

	for (const tenant of tenants) {
		if (!tenant.email) continue;
		const to = { uid: tenant.uid, email: tenant.email };
		// Each late-fee notice is its own email; the day's reminders go together in one.
		for (const notice of notices.lateFees) {
			await sendOnce(to, [notice], () => notice.content);
		}
		for (const notice of notices.autopay.filter((n) => n.uid === tenant.uid)) {
			await sendOnce(to, [notice], () => notice.content);
		}
		if (notices.enrolled.includes(tenant.uid)) continue;
		await sendOnce(to, notices.reminders, (claimed) =>
			renderDueReminderEmail({ address, items: claimed.map((r) => r.item), link })
		);
	}
}
