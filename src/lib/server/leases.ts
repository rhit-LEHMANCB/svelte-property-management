import { error } from '@sveltejs/kit';
import type { DocumentData } from 'firebase-admin/firestore';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { normalizeEmails, type LeaseInput } from '$lib/schemas';
import { adminAuth, adminDB, adminStorage } from './admin';
import { sendPasswordResetEmail } from './email';
import {
	businessToday,
	datesOverlap,
	leaseStatus,
	type LeaseDoc,
	type LeaseDocument
} from './leaseDates';
import { createTenantAccount, type CreatedAccount } from './users';
import { depositRef, loadLeaseLedger } from './balance';
import { toCents, type DepositLedger, type Ledger } from './billing';
import { methodLabel } from './autopay';
import { latestCharge, latestOpenCharge, loadCharges, loadEnrollments } from './autopayStore';
import type {
	EmailProblem,
	LeaseBilling,
	LeaseSummary,
	OverlapSummary,
	TenantLease,
	TenantSummary
} from '$lib/leaseTypes';

export type { EmailProblem, LeaseSummary, OverlapSummary, TenantLease, TenantSummary };

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const leases = () => adminDB.collection('leases');
const bucket = () => adminStorage.bucket(`gs://${PUBLIC_FB_STORAGE_BUCKET}`);

/** `12 Elm St, Apt 2, Terre Haute`: the street address, apartment and city of a property. */
export function propertyAddress(property: DocumentData | undefined) {
	if (!property) return 'a deleted property';
	return [property.streetAddress, property.apartmentInfo, property.city]
		.filter((part) => typeof part === 'string' && part.trim() !== '')
		.join(', ');
}

async function tenantSummaries(tenantIds: string[]): Promise<TenantSummary[]> {
	const docs = await Promise.all(tenantIds.map((id) => adminDB.collection('users').doc(id).get()));
	return docs
		.filter((doc) => doc.exists)
		.map((doc) => {
			const data = doc.data()!;
			return {
				id: doc.id,
				name: `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim(),
				email: data.email ?? ''
			};
		});
}

export async function summarizeLease(
	id: string,
	lease: LeaseDoc,
	today = businessToday()
): Promise<LeaseSummary> {
	return {
		id,
		propertyId: lease.propertyId,
		rent: lease.rent,
		startDate: lease.startDate,
		endDate: lease.endDate,
		status: leaseStatus(lease, today),
		tenants: await tenantSummaries(lease.tenantIds),
		hasDocument: lease.document !== null && lease.document !== undefined
	};
}

/** The admin's view of what a lease owes and holds. */
export function leaseBilling(ledger: Ledger): LeaseBilling {
	const { settlement } = ledger.deposit;
	return {
		totalCents: ledger.totalCents,
		creditCents: ledger.creditCents,
		dueDate: ledger.dueDate,
		deposit: {
			amountCents: ledger.deposit.amountCents,
			paidCents: ledger.deposit.paidCents,
			heldCents: ledger.deposit.heldCents,
			settled: ledger.deposit.settled,
			toSettle: ledger.deposit.toSettle,
			settlement: settlement
				? {
						returned: settlement.returned,
						deductions: settlement.deductions,
						recordedAt: settlement.recordedAt
					}
				: null
		},
		lateFees: ledger.lateFees.map((fee) => ({
			month: fee.month.key,
			monthLabel: `${fee.month.monthName} ${fee.month.year}`,
			amountCents: fee.amountCents,
			paidCents: fee.paidCents,
			owedCents: fee.owedCents,
			waived: fee.waived
		}))
	};
}

/** Every lease of a property, newest start date first, with what each owes and holds. */
export async function listPropertyLeases(
	propertyId: string,
	now = new Date()
): Promise<LeaseSummary[]> {
	const snapshot = await leases()
		.where('propertyId', '==', propertyId)
		.orderBy('startDate', 'desc')
		.get();
	const today = businessToday(now);
	return Promise.all(
		snapshot.docs.map(async (doc) => {
			const lease = doc.data() as LeaseDoc;
			const [summary, ledger, enrollments, charges] = await Promise.all([
				summarizeLease(doc.id, lease, today),
				loadLeaseLedger(doc.id, lease, now),
				loadEnrollments(doc.ref),
				loadCharges(doc.ref)
			]);
			const nameOf = (uid: string) =>
				summary.tenants.find((t) => t.id === uid)?.name || 'A former tenant';
			const status = latestOpenCharge(charges, { owedCents: ledger.totalCents });
			return {
				...summary,
				billing: leaseBilling(ledger),
				autopay: enrollments
					.filter((e) => lease.tenantIds.includes(e.uid))
					.map((e) => ({
						tenantId: e.uid,
						name: nameOf(e.uid),
						method: methodLabel(e),
						amountCents: e.amountCents
					})),
				autopayStatus: status && {
					state: status.state,
					name: nameOf(status.uid),
					day: status.day,
					amountCents: status.amountCents,
					attempts: status.attempts
				}
			};
		})
	);
}

/**
 * What needs an admin's attention across all properties: open maintenance requests, ended leases
 * whose deposit is still to settle, and leases whose latest autopay charge failed or gave up while
 * money is still owed. Reads every lease, which is fine at a family landlord's scale; a lease that
 * cannot be read is logged and left out of the counts.
 */
export async function adminAttention(now = new Date()) {
	const [openRequests, leaseDocs] = await Promise.all([
		adminDB.collection('maintenance').where('status', '==', 'Open').get(),
		leases().get()
	]);
	const settled = await Promise.allSettled(
		leaseDocs.docs.map(async (doc) => {
			const lease = doc.data() as LeaseDoc;
			const [ledger, charges] = await Promise.all([
				loadLeaseLedger(doc.id, lease, now),
				loadCharges(doc.ref)
			]);
			// Only the latest charge counts: a failure followed by a successful charge is resolved.
			const latest = latestCharge(charges);
			return {
				depositToSettle: ledger.deposit.toSettle,
				autopayFailed:
					ledger.totalCents > 0 && (latest?.state === 'failed' || latest?.state === 'gave-up')
			};
		})
	);
	// One lease that cannot be read must not take admin home down with it.
	const perLease = settled.flatMap((result, index) => {
		if (result.status === 'fulfilled') return [result.value];
		console.error(`adminAttention: lease ${leaseDocs.docs[index].id} skipped`, result.reason);
		return [];
	});
	return {
		openRequests: openRequests.docs.length,
		depositsToSettle: perLease.filter((l) => l.depositToSettle).length,
		failedAutopay: perLease.filter((l) => l.autopayFailed).length
	};
}

export type AdminAttention = Awaited<ReturnType<typeof adminAttention>>;

/** Every lease a user is on, as `[id, lease]` pairs. */
export async function leasesOfTenant(uid: string): Promise<[string, LeaseDoc][]> {
	const snapshot = await leases().where('tenantIds', 'array-contains', uid).get();
	return snapshot.docs.map((doc) => [doc.id, doc.data() as LeaseDoc]);
}

/**
 * A tenant's leases, newest start first, with the property data of each (null when the property
 * no longer exists).
 */
export async function loadTenantLeases(
	uid: string,
	options: { withOtherTenants?: boolean; today?: string } = {}
): Promise<{ lease: TenantLease; property: DocumentData | null }[]> {
	const today = options.today ?? businessToday();
	const own = await leasesOfTenant(uid);
	const propertyIds = [...new Set(own.map(([, lease]) => lease.propertyId))];
	const propertyDocs = await Promise.all(
		propertyIds.map((id) => adminDB.collection('properties').doc(id).get())
	);
	const properties = new Map(propertyDocs.map((doc) => [doc.id, doc.data() ?? null]));
	const result = await Promise.all(
		own.map(async ([id, lease]) => {
			const property = properties.get(lease.propertyId) ?? null;
			// Only the dashboard shows the other tenants; every other page skips those reads.
			const others = options.withOtherTenants
				? await tenantSummaries(lease.tenantIds.filter((t) => t !== uid))
				: undefined;
			return {
				lease: {
					id,
					propertyId: lease.propertyId,
					address: propertyAddress(property ?? undefined),
					rent: lease.rent,
					startDate: lease.startDate,
					endDate: lease.endDate,
					status: leaseStatus(lease, today),
					...(others && { otherTenants: others.map((t) => t.name || 'A tenant') }),
					hasDocument: Boolean(lease.document),
					deposit: lease.deposit ?? null,
					lateFee: lease.lateFee,
					graceDays: lease.graceDays,
					lateFeesFrom: lease.lateFeesFrom
				},
				property
			};
		})
	);
	return result.sort((a, b) => b.lease.startDate.localeCompare(a.lease.startDate));
}

type TenantLeaseWithProperty = Awaited<ReturnType<typeof loadTenantLeases>>[number];

/**
 * The tenant's current lease whose property still exists: the one with the latest start date if
 * there are several (only data written outside the app can cause that). Expects the newest-first
 * order `loadTenantLeases` returns.
 */
export function currentTenancy(
	tenantLeases: TenantLeaseWithProperty[]
): (TenantLeaseWithProperty & { property: DocumentData }) | undefined {
	const current = tenantLeases.filter((l) => l.lease.status === 'current' && l.property);
	if (current.length > 1) {
		console.log(
			`A tenant is on ${current.length} current leases (${current.map((l) => l.lease.id).join(', ')}); using the latest.`
		);
	}
	return current[0] as (TenantLeaseWithProperty & { property: DocumentData }) | undefined;
}

export type SaveLeaseResult =
	| { kind: 'saved'; leaseId: string; emailFailures: string[] }
	| { kind: 'conflicts'; problems: EmailProblem[] }
	| { kind: 'overlap'; overlapping: OverlapSummary[] }
	| { kind: 'documentError'; message: string }
	| { kind: 'depositBelowPaid'; paid: number };

/** Why a PDF upload is refused, or null when it is acceptable. */
export async function documentProblem(file: File): Promise<string | null> {
	if (file.size > MAX_DOCUMENT_BYTES) return 'The lease document must be 10 MB or smaller.';
	const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
	const isPdf = new TextDecoder().decode(head) === '%PDF-';
	if (file.type !== 'application/pdf' || !isPdf) return 'The lease document must be a PDF.';
	return null;
}

const codeOf = (err: unknown) => (err as { code?: string } | undefined)?.code;

/** Raised inside the save transaction when the lease being edited was deleted meanwhile. */
class LeaseGoneError extends Error {}

/** Raised inside the save transaction when an overlap appeared after the first check. */
class LeaseOverlapError extends Error {
	constructor(public overlapping: { id: string; data(): unknown }[]) {
		super('Lease overlap');
	}
}

/** Raised inside the save transaction when the deposit would be less than what was paid. */
class DepositBelowPaidError extends Error {
	constructor(public paid: number) {
		super('Deposit below paid');
	}
}

/** Raised inside the save transaction when a conflict appeared after the first check. */
class LeaseConflictError extends Error {
	constructor(public problems: EmailProblem[]) {
		super('Lease conflict');
	}
}

type Dates = { startDate: string; endDate: string | null };

/** Problems for tenants who are already on another lease whose dates overlap these. */
function conflictsFor(
	email: string,
	others: [string, LeaseDoc][],
	leaseId: string | undefined,
	dates: Dates,
	addresses: Map<string, string>
): EmailProblem[] {
	return others
		.filter(([id, lease]) => id !== leaseId && datesOverlap(lease, dates))
		.map(([, lease]) => ({
			email,
			message: `${email} is already on a lease at ${addresses.get(lease.propertyId) ?? 'another property'} from ${lease.startDate} ${lease.endDate ? `to ${lease.endDate}` : '(month to month)'}.`
		}));
}

async function addressesOf(propertyIds: string[]) {
	const unique = [...new Set(propertyIds)];
	const docs = await Promise.all(
		unique.map((id) => adminDB.collection('properties').doc(id).get())
	);
	return new Map(docs.map((doc) => [doc.id, propertyAddress(doc.data())]));
}

/**
 * Creates (no `leaseId`) or updates a lease of `propertyId`. Order matters: everything that can be
 * refused is checked before any account is created; accounts are created next and undone if the
 * lease cannot be written; the write re-checks conflicts in a transaction so two admins saving at
 * once cannot both win; welcome emails go out only after the lease is saved.
 */
export async function saveLease(options: {
	propertyId: string;
	leaseId?: string;
	input: LeaseInput;
	document?: File | null;
	now?: Date;
}): Promise<SaveLeaseResult> {
	const { propertyId, leaseId, input } = options;
	const now = options.now ?? new Date();

	const property = (await adminDB.collection('properties').doc(propertyId).get()).data();
	if (!property) throw error(404, 'Property not found');

	const leaseRef = leaseId ? leases().doc(leaseId) : leases().doc();
	const existing = leaseId ? ((await leaseRef.get()).data() as LeaseDoc | undefined) : undefined;
	if (leaseId && (!existing || existing.propertyId !== propertyId)) {
		throw error(404, 'Lease not found');
	}

	const upload = options.document && options.document.size > 0 ? options.document : null;
	if (upload) {
		const problem = await documentProblem(upload);
		if (problem) return { kind: 'documentError', message: problem };
	}

	const dates: Dates = { startDate: input.startDate, endDate: input.endDate || null };
	const emails = normalizeEmails(input.emails);

	// Who each email is: an existing tenant, or someone who needs an account.
	const problems: EmailProblem[] = [];
	const existingTenants: { email: string; uid: string }[] = [];
	const newEmails: string[] = [];
	for (const email of emails) {
		let uid: string;
		try {
			uid = (await adminAuth.getUserByEmail(email)).uid;
		} catch (err) {
			if (codeOf(err) === 'auth/user-not-found') {
				newEmails.push(email);
				continue;
			}
			throw err;
		}
		const user = (await adminDB.collection('users').doc(uid).get()).data();
		if (!user) {
			problems.push({
				email,
				message: `${email} has a sign-in account but no user record. Remove it in Firebase Authentication, then try again.`
			});
		} else if (user.permissions === 'admin') {
			problems.push({ email, message: `${email} belongs to an admin and cannot be a tenant.` });
		} else {
			existingTenants.push({ email, uid });
		}
	}

	const tenantLeases = await Promise.all(existingTenants.map(({ uid }) => leasesOfTenant(uid)));
	const addresses = await addressesOf(tenantLeases.flat().map(([, lease]) => lease.propertyId));
	existingTenants.forEach(({ email }, index) => {
		problems.push(...conflictsFor(email, tenantLeases[index], leaseId, dates, addresses));
	});
	if (problems.length > 0) return { kind: 'conflicts', problems };

	const overlapsAtProperty = (docs: { id: string; data(): unknown }[]) =>
		docs.filter((doc) => doc.id !== leaseRef.id && datesOverlap(doc.data() as LeaseDoc, dates));
	const overlapResult = async (
		docs: { id: string; data(): unknown }[]
	): Promise<SaveLeaseResult> => ({
		kind: 'overlap',
		overlapping: await Promise.all(
			docs.map(async (doc) => {
				const lease = doc.data() as LeaseDoc;
				return {
					id: doc.id,
					startDate: lease.startDate,
					endDate: lease.endDate,
					tenantNames: (await tenantSummaries(lease.tenantIds)).map((t) => t.name || t.email)
				};
			})
		)
	});
	const atPropertyQuery = leases().where('propertyId', '==', propertyId);

	if (!input.confirmOverlap) {
		const overlapping = overlapsAtProperty((await atPropertyQuery.get()).docs);
		if (overlapping.length > 0) return overlapResult(overlapping);
	}

	const created: (CreatedAccount & { email: string })[] = [];
	let uploadedPath: string | null = null;
	// The document file the saved lease replaced, read in the transaction.
	let replacedPath: string | undefined;
	try {
		for (const email of newEmails) {
			created.push({ email, ...(await createTenantAccount(email, { sendWelcome: false })) });
		}

		let document: LeaseDocument | null = existing?.document ?? null;
		if (upload) {
			// A new name for every upload, so a failed save never overwrites the document in use.
			uploadedPath = `leases/${leaseRef.id}/${now.getTime()}.pdf`;
			await bucket()
				.file(uploadedPath)
				.save(new Uint8Array(await upload.arrayBuffer()), {
					contentType: 'application/pdf',
					resumable: false
				});
			document = {
				path: uploadedPath,
				fileName: upload.name || 'lease.pdf',
				size: upload.size,
				uploadedAt: now.toISOString()
			};
		}

		const tenantIds = [...existingTenants.map((t) => t.uid), ...created.map((c) => c.uid)];
		const emailOf = new Map([
			...existingTenants.map((t) => [t.uid, t.email] as const),
			...created.map((c) => [c.uid, c.email] as const)
		]);

		await adminDB.runTransaction(async (tx) => {
			// An edit re-reads the lease, so it never recreates one deleted meanwhile and keeps the
			// document and creation time stored now.
			const stored = leaseId
				? ((await tx.get(leaseRef)).data() as LeaseDoc | undefined)
				: undefined;
			if (leaseId && !stored) throw new LeaseGoneError();
			replacedPath = stored?.document?.path;
			const fresh = await Promise.all(
				tenantIds.map((uid) => tx.get(leases().where('tenantIds', 'array-contains', uid)))
			);
			const raced = tenantIds.flatMap((uid, index) =>
				conflictsFor(
					emailOf.get(uid)!,
					fresh[index].docs.map((doc) => [doc.id, doc.data() as LeaseDoc]),
					leaseRef.id,
					dates,
					addresses
				)
			);
			if (raced.length > 0) throw new LeaseConflictError(raced);
			// Another admin may have saved an overlapping lease here since the warning was checked.
			if (!input.confirmOverlap) {
				const overlapping = overlapsAtProperty((await tx.get(atPropertyQuery)).docs);
				if (overlapping.length > 0) throw new LeaseOverlapError(overlapping);
			}

			// A deposit cannot drop below what has been paid toward it (the webhook updates the
			// ledger in a transaction that reads the lease, so the two cannot interleave).
			const paidDeposit = toCents(
				((await tx.get(depositRef(leaseRef))).data() as DepositLedger | undefined)?.paid ?? 0
			);
			if (toCents(input.deposit ?? 0) < paidDeposit) {
				throw new DepositBelowPaidError(paidDeposit / 100);
			}

			const lease: LeaseDoc = {
				propertyId,
				tenantIds,
				rent: input.rent,
				startDate: dates.startDate,
				endDate: dates.endDate,
				document: upload ? document : (stored?.document ?? null),
				deposit:
					input.deposit !== undefined
						? { amount: input.deposit, dueDate: input.depositDueDate || dates.startDate }
						: null,
				lateFee: input.lateFee,
				graceDays: input.graceDays,
				// Months due before a lease was entered are never charged a late fee.
				lateFeesFrom: stored?.lateFeesFrom ?? businessToday(now),
				createdAt: stored?.createdAt ?? now.toISOString(),
				updatedAt: now.toISOString()
			};
			tx.set(leaseRef, lease);
		});
	} catch (err) {
		if (uploadedPath) {
			await bucket()
				.file(uploadedPath)
				.delete()
				.catch(() => undefined);
		}
		for (const account of created) await account.undo();
		if (err instanceof LeaseConflictError) return { kind: 'conflicts', problems: err.problems };
		if (err instanceof LeaseGoneError) throw error(404, 'Lease not found');
		if (err instanceof LeaseOverlapError) return overlapResult(err.overlapping);
		if (err instanceof DepositBelowPaidError) return { kind: 'depositBelowPaid', paid: err.paid };
		throw err;
	}

	// The lease now points at the new document; the old file is no longer needed.
	if (uploadedPath && replacedPath && replacedPath !== uploadedPath) {
		await bucket()
			.file(replacedPath)
			.delete()
			.catch((err) => console.log('Could not delete the replaced lease document', err));
	}

	const emailFailures: string[] = [];
	const welcome = { address: propertyAddress(property), startDate: dates.startDate };
	for (const { email } of created) {
		try {
			await sendPasswordResetEmail(email, true, welcome);
		} catch (err) {
			console.log('Welcome email failed', err instanceof Error ? err.message : err);
			emailFailures.push(email);
		}
	}

	return { kind: 'saved', leaseId: leaseRef.id, emailFailures };
}

/**
 * Deletes a lease with no recorded rent, deposit or late-fee payments, with its document; refuses one
 * that has any.
 */
export async function deleteLease(
	leaseId: string
): Promise<'deleted' | 'has-payments' | 'missing'> {
	const leaseRef = leases().doc(leaseId);
	// The check and the delete are one transaction, and the webhook records a payment in one
	// transaction that reads the lease: a payment either lands first and blocks the delete, or finds
	// the lease gone.
	const outcome = await adminDB.runTransaction(async (tx) => {
		if (!(await tx.get(leaseRef)).exists) return 'missing' as const;
		const [history, lateFees, deposit, invoices, notices] = await Promise.all([
			tx.get(leaseRef.collection('payment_history').limit(1)),
			tx.get(leaseRef.collection('late_fees')),
			tx.get(depositRef(leaseRef)),
			tx.get(leaseRef.collection('recorded_invoices')),
			tx.get(leaseRef.collection('notices'))
		]);
		const paid = (record: { paid?: number } | undefined) => toCents(record?.paid ?? 0) > 0;
		if (!history.empty || lateFees.docs.some((doc) => paid(doc.data())) || paid(deposit.data())) {
			return 'has-payments' as const;
		}
		// What is left is bookkeeping only: unpaid or waived late fees, an empty deposit ledger, handled
		// invoices and sent-email records.
		[...lateFees.docs, ...invoices.docs, ...notices.docs].forEach((doc) => tx.delete(doc.ref));
		if (deposit.exists) tx.delete(deposit.ref);
		tx.delete(leaseRef);
		return 'deleted' as const;
	});
	// The lease is gone either way; a file left by a failed cleanup is removed on the next delete.
	if (outcome !== 'has-payments') {
		await bucket()
			.deleteFiles({ prefix: `leases/${leaseId}/` })
			.catch((err) =>
				console.error(
					`Could not delete the files of lease ${leaseId}; deleting it again retries.`,
					err instanceof Error ? err.message : err
				)
			);
	}
	return outcome;
}
