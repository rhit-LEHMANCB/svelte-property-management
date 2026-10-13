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
import type {
	EmailProblem,
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

/** Every lease of a property, newest start date first. */
export async function listPropertyLeases(propertyId: string): Promise<LeaseSummary[]> {
	const snapshot = await leases()
		.where('propertyId', '==', propertyId)
		.orderBy('startDate', 'desc')
		.get();
	const today = businessToday();
	return Promise.all(
		snapshot.docs.map((doc) => summarizeLease(doc.id, doc.data() as LeaseDoc, today))
	);
}

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
					hasDocument: Boolean(lease.document)
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
	| { kind: 'documentError'; message: string };

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

			const lease: LeaseDoc = {
				propertyId,
				tenantIds,
				rent: input.rent,
				startDate: dates.startDate,
				endDate: dates.endDate,
				document: upload ? document : (stored?.document ?? null),
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

/** Deletes a lease with no recorded payments, with its document; refuses one that has payments. */
export async function deleteLease(
	leaseId: string
): Promise<'deleted' | 'has-payments' | 'missing'> {
	const leaseRef = leases().doc(leaseId);
	// The check and the delete are one transaction, and the webhook records a payment in one
	// transaction that reads the lease: a payment either lands first and blocks the delete, or finds
	// the lease gone.
	const outcome = await adminDB.runTransaction(async (tx) => {
		if (!(await tx.get(leaseRef)).exists) return 'missing' as const;
		const history = await tx.get(leaseRef.collection('payment_history').limit(1));
		if (!history.empty) return 'has-payments' as const;
		const invoices = await tx.get(leaseRef.collection('recorded_invoices'));
		invoices.docs.forEach((doc) => tx.delete(doc.ref));
		tx.delete(leaseRef);
		return 'deleted' as const;
	});
	if (outcome === 'deleted') {
		await bucket().deleteFiles({ prefix: `leases/${leaseId}/` });
	}
	return outcome;
}
