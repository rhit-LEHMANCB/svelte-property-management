import { error } from '@sveltejs/kit';
import type { DocumentReference } from 'firebase-admin/firestore';
import { adminDB } from './admin';
import {
	byEnrollmentOrder,
	publicEnrollment,
	type ChargeRecord,
	type Enrollment,
	type PublicEnrollment
} from './autopay';
import type { LeaseDoc } from './leaseDates';

/**
 * Where autopay lives in Firestore: `leases/{id}/autopay/{uid}` for enrollments and
 * `leases/{id}/autopay_charges/{cycleKey}_{uid}` for charges. Only server code reads them; the
 * rules deny every client.
 */

export const leaseRefOf = (leaseId: string) => adminDB.collection('leases').doc(leaseId);
export const enrollmentRef = (leaseRef: DocumentReference, uid: string) =>
	leaseRef.collection('autopay').doc(uid);
export const chargesRef = (leaseRef: DocumentReference) => leaseRef.collection('autopay_charges');
/** When a tenant last turned autopay off on a lease, so an old setup link cannot turn it back on. */
export const autopayOffRef = (leaseRef: DocumentReference, uid: string) =>
	leaseRef.collection('autopay_off').doc(uid);

/** A lease's enrollments, in charge order. */
export async function loadEnrollments(leaseRef: DocumentReference): Promise<Enrollment[]> {
	const snapshot = await leaseRef.collection('autopay').get();
	return snapshot.docs
		.map((doc) => ({ ...(doc.data() as Omit<Enrollment, 'uid'>), uid: doc.id }))
		.sort(byEnrollmentOrder);
}

export async function loadCharges(leaseRef: DocumentReference): Promise<ChargeRecord[]> {
	const snapshot = await chargesRef(leaseRef).get();
	return snapshot.docs.map((doc) => doc.data() as ChargeRecord);
}

/** The latest charge that has not simply succeeded: what a tenant or admin needs to know about. */
export type ChargeStatus = {
	state: 'claimed' | 'pending' | 'failed' | 'gave-up';
	uid: string;
	day: string;
	amountCents: number;
	attempts: number;
};

export function latestOpenCharge(
	charges: ChargeRecord[],
	options: { uid?: string; owedCents: number }
): ChargeStatus | null {
	const { uid, owedCents } = options;
	const open = charges
		.filter((c) => c.state !== 'succeeded' && (uid === undefined || c.uid === uid))
		// A failure stops mattering once the lease owes nothing (paid by hand since).
		.filter((c) => owedCents > 0 || c.state === 'pending' || c.state === 'claimed')
		.sort(
			(a, b) =>
				a.lastAttemptDay.localeCompare(b.lastAttemptDay) || a.claimedAt.localeCompare(b.claimedAt)
		)
		.at(-1);
	if (!open || open.state === 'succeeded') return null;
	return {
		state: open.state,
		uid: open.uid,
		day: open.lastAttemptDay,
		amountCents: open.amountCents,
		attempts: open.attempts
	};
}

/**
 * The lease a tenant manages autopay for. A missing, unknown or someone else's lease gets the same
 * 403, so lease ids cannot be probed.
 */
export async function tenantLeaseOrError(leaseId: unknown, uid: string) {
	// A lease id is one path segment; anything else could address another document.
	const lease =
		typeof leaseId === 'string' && /^[A-Za-z0-9_-]+$/.test(leaseId)
			? ((await leaseRefOf(leaseId).get()).data() as LeaseDoc | undefined)
			: undefined;
	if (!lease || !Array.isArray(lease.tenantIds) || !lease.tenantIds.includes(uid)) {
		throw error(403, 'You can only manage autopay for a lease you are on.');
	}
	return { leaseId: leaseId as string, lease, leaseRef: leaseRefOf(leaseId as string) };
}

/** A tenant's own enrollment on a lease, as they may see it, or null. */
export async function ownEnrollment(
	leaseRef: DocumentReference,
	uid: string
): Promise<PublicEnrollment | null> {
	const data = (await enrollmentRef(leaseRef, uid).get()).data() as
		Omit<Enrollment, 'uid'> | undefined;
	return data ? publicEnrollment({ ...data, uid }) : null;
}
