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
	type LeaseDocument,
	type LeaseStatus
} from './leaseDates';
import { createTenantAccount, type CreatedAccount } from './users';

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

export type TenantSummary = { id: string; name: string; email: string };

export type LeaseSummary = {
	id: string;
	propertyId: string;
	rent: number;
	startDate: string;
	endDate: string | null;
	status: LeaseStatus;
	tenants: TenantSummary[];
	hasDocument: boolean;
};

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

export type OverlapSummary = {
	id: string;
	startDate: string;
	endDate: string | null;
	tenantNames: string[];
};

export type EmailProblem = { email: string; message: string };

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

	if (!input.confirmOverlap) {
		const atProperty = await leases().where('propertyId', '==', propertyId).get();
		const overlapping = atProperty.docs.filter(
			(doc) => doc.id !== leaseId && datesOverlap(doc.data() as LeaseDoc, dates)
		);
		if (overlapping.length > 0) {
			return {
				kind: 'overlap',
				overlapping: await Promise.all(
					overlapping.map(async (doc) => {
						const lease = doc.data() as LeaseDoc;
						return {
							id: doc.id,
							startDate: lease.startDate,
							endDate: lease.endDate,
							tenantNames: (await tenantSummaries(lease.tenantIds)).map((t) => t.name || t.email)
						};
					})
				)
			};
		}
	}

	const created: (CreatedAccount & { email: string })[] = [];
	let uploadedPath: string | null = null;
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

			const lease: LeaseDoc = {
				propertyId,
				tenantIds,
				rent: input.rent,
				startDate: dates.startDate,
				endDate: dates.endDate,
				document,
				createdAt: existing?.createdAt ?? now.toISOString(),
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
		throw err;
	}

	// The lease now points at the new document; the old file is no longer needed.
	if (uploadedPath && existing?.document?.path && existing.document.path !== uploadedPath) {
		await bucket()
			.file(existing.document.path)
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
	if (!(await leaseRef.get()).exists) return 'missing';
	const history = await leaseRef.collection('payment_history').limit(1).get();
	if (!history.empty) return 'has-payments';

	const invoices = await leaseRef.collection('recorded_invoices').get();
	await Promise.all(invoices.docs.map((doc) => doc.ref.delete()));
	await bucket().deleteFiles({ prefix: `leases/${leaseId}/` });
	await leaseRef.delete();
	return 'deleted';
}
