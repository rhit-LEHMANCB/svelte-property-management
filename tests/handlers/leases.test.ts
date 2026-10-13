import { beforeEach, describe, expect, it } from 'vitest';
import { PUBLIC_FB_STORAGE_BUCKET } from '$env/static/public';
import { actions as newActions } from '../../src/routes/(authenticated)/admin/properties/[propertyId]/leases/new/+page.server';
import {
	actions as editActions,
	load as editLoad
} from '../../src/routes/(authenticated)/admin/properties/[propertyId]/leases/[leaseId]/+page.server';
import { load as newLoad } from '../../src/routes/(authenticated)/admin/properties/[propertyId]/leases/new/+page.server';
import { load as propertyEditLoad } from '../../src/routes/(authenticated)/admin/properties/[propertyId]/edit/+page.server';
import { DELETE as deleteLease } from '../../src/routes/api/lease/[leaseId]/+server';
import { GET as getDocument } from '../../src/routes/api/lease/[leaseId]/document/+server';
import { call } from '../helpers/callHandler';
import { lookUpSeededUserByEmail, services } from '../helpers/services';
import { db, seedAdmin, seedLease, seedProperty, seedTenant } from '../helpers/seed';

// leases: creating, editing and deleting leases, and their documents.

// Email lookups answer from the seeded users, so unknown emails are new accounts.
beforeEach(() => {
	services.auth.getUserByEmail.mockImplementation(lookUpSeededUserByEmail);
});
const PDF = new TextEncoder().encode('%PDF-1.7\n% a tiny test document\n');

function leaseForm(fields: {
	rent?: string;
	startDate?: string;
	endDate?: string;
	emails?: string[];
	confirmOverlap?: boolean;
	document?: Blob & { name?: string };
}) {
	const fd = new FormData();
	fd.append('rent', fields.rent ?? '1250');
	fd.append('startDate', fields.startDate ?? '2026-11-01');
	fd.append('endDate', fields.endDate ?? '');
	for (const email of fields.emails ?? ['tenant-1@example.com']) fd.append('emails', email);
	if (fields.confirmOverlap) fd.append('confirmOverlap', 'true');
	if (fields.document) fd.append('document', fields.document);
	return fd;
}

const pdfFile = (
	bytes: Uint8Array<ArrayBuffer> = PDF,
	name = 'lease.pdf',
	type = 'application/pdf'
) => new File([bytes], name, { type });

const create = (form: FormData, propertyId = 'prop-1') =>
	call(newActions.default, { userID: 'admin-1', params: { propertyId }, form });

const edit = (leaseId: string, form: FormData, propertyId = 'prop-1') =>
	call(editActions.default, { userID: 'admin-1', params: { propertyId, leaseId }, form });

type StoredLease = { tenantIds: string[]; document: { path: string } & Record<string, unknown> };
const leases = async () =>
	(await db.collection('leases').get()).docs.map((doc) => ({
		id: doc.id,
		data: () => doc.data() as StoredLease & Record<string, unknown>
	}));

function setup() {
	seedAdmin('admin-1');
	seedProperty('prop-1', { rent: 1200, streetAddress: '1 Main St', city: 'Terre Haute' });
	seedProperty('prop-2', { title: 'Oak House', streetAddress: '9 Oak Ave', city: 'Brazil' });
	seedTenant('tenant-1');
}

describe('leases: Lease record and Create a lease', () => {
	it('Scenario: Valid lease is stored with property, tenant, rent, start and no end date', async () => {
		setup();
		const result = await create(leaseForm({}));
		expect(result.redirect).toBe('/admin/properties/prop-1/edit?tab=leases');
		const [lease] = await leases();
		expect(lease.data()).toMatchObject({
			propertyId: 'prop-1',
			tenantIds: ['tenant-1'],
			rent: 1250,
			startDate: '2026-11-01',
			endDate: null,
			document: null
		});
	});

	it('Scenario: Invalid fields: nothing is saved and the field has the error', async () => {
		setup();
		const result = await create(leaseForm({ endDate: '2026-10-01' }));
		expect(result.status).toBe(400);
		expect(result.data.form.errors.endDate).toEqual(['End date must be after start date']);
		expect(await leases()).toHaveLength(0);
	});

	it('Scenario: No tenants', async () => {
		setup();
		const result = await create(leaseForm({ emails: [''] }));
		expect(result.status).toBe(400);
		expect(result.data.form.errors.emails._errors).toEqual(['A lease needs at least one tenant.']);
		expect(await leases()).toHaveLength(0);
	});

	it('Scenario: Prefilled rent comes from the property', async () => {
		setup();
		const result = await call(newLoad, { userID: 'admin-1', params: { propertyId: 'prop-1' } });
		expect(result.data.form.data.rent).toBe(1200);
		expect(result.data.property.address).toBe('1 Main St, Terre Haute');
	});

	it('Scenario: Unknown property responds 404', async () => {
		setup();
		const result = await call(newLoad, { userID: 'admin-1', params: { propertyId: 'nope' } });
		expect(result.status).toBe(404);
		expect((await create(leaseForm({}), 'nope')).status).toBe(404);
	});

	it('a tenant cannot create a lease (401)', async () => {
		setup();
		const result = await call(newActions.default, {
			userID: 'tenant-1',
			params: { propertyId: 'prop-1' },
			form: leaseForm({})
		});
		expect(result.status).toBe(401);
		expect(await leases()).toHaveLength(0);
	});
});

describe('leases: Add tenants by email', () => {
	it('Scenario: Existing tenant is attached, case and spaces ignored, without a new account', async () => {
		setup();
		await create(leaseForm({ emails: ['  TENANT-1@Example.com '] }));
		const [lease] = await leases();
		expect(lease.data().tenantIds).toEqual(['tenant-1']);
		expect(services.auth.createUser).not.toHaveBeenCalled();
	});

	it('Scenario: Same email twice is added once', async () => {
		setup();
		await create(leaseForm({ emails: ['tenant-1@example.com', 'Tenant-1@example.com'] }));
		expect((await leases())[0].data().tenantIds).toEqual(['tenant-1']);
	});

	it('Scenario: Malformed email names the entry and saves nothing', async () => {
		setup();
		const result = await create(leaseForm({ emails: ['tenant-1@example.com', 'nope'] }));
		expect(result.status).toBe(400);
		expect(result.data.form.errors.emails['1']).toEqual(['"nope" is not a valid email address']);
		expect(await leases()).toHaveLength(0);
	});
});

describe('leases: New tenant accounts from a lease', () => {
	it('Scenario: New email gets an account, is on the lease, and gets the welcome email naming the property', async () => {
		setup();
		const result = await create(leaseForm({ emails: ['tenant-1@example.com', 'New@Example.com'] }));
		expect(result.redirect).toBeDefined();
		expect(services.auth.createUser).toHaveBeenCalledWith({ email: 'new@example.com' });
		expect(db.peek('users/new-user-uid')).toMatchObject({
			email: 'new@example.com',
			firstName: 'New',
			lastName: 'User',
			permissions: 'user',
			stripeID: 'cus_new'
		});
		expect((await leases())[0].data().tenantIds).toEqual(['tenant-1', 'new-user-uid']);
		expect(services.sendPasswordResetEmail).toHaveBeenCalledOnce();
		expect(services.sendPasswordResetEmail).toHaveBeenCalledWith('new@example.com', true, {
			address: '1 Main St, Terre Haute',
			startDate: '2026-11-01'
		});
	});

	it('Scenario: Saving fails after accounts were created: accounts are removed, nothing saved', async () => {
		setup();
		const realTransaction = db.runTransaction.bind(db);
		db.runTransaction = (async () => {
			throw new Error('Firestore unavailable');
		}) as typeof db.runTransaction;
		try {
			const result = await create(leaseForm({ emails: ['brand@new.com'] }));
			expect(result.status).toBe(500);
			expect(result.data.form.message).toEqual({
				type: 'error',
				text: 'The lease could not be saved and nothing was changed. Please try again.'
			});
		} finally {
			db.runTransaction = realTransaction;
		}
		expect(await leases()).toHaveLength(0);
		expect(db.peek('users/new-user-uid')).toBeUndefined();
		expect(services.stripe.customers.del).toHaveBeenCalledWith('cus_new');
		expect(services.auth.deleteUser).toHaveBeenCalledWith('new-user-uid');
		expect(services.sendPasswordResetEmail).not.toHaveBeenCalled();
	});

	it('Scenario: Welcome email fails: lease and account are kept and the admin is told which address', async () => {
		setup();
		services.sendPasswordResetEmail.mockRejectedValueOnce(new Error('Email delivery failed'));
		const result = await create(leaseForm({ emails: ['brand@new.com'] }));
		expect(result.status).toBe(200);
		expect(result.data.form.message).toMatchObject({
			type: 'emailFailures',
			emails: ['brand@new.com']
		});
		expect(await leases()).toHaveLength(1);
		expect(db.peek('users/new-user-uid')).toBeDefined();
	});
});

describe('leases: Lease conflicts', () => {
	it('Scenario: Admin email is refused and nothing is created', async () => {
		setup();
		const result = await create(leaseForm({ emails: ['admin-1@example.com', 'brand@new.com'] }));
		expect(result.status).toBe(400);
		expect(result.data.form.message).toEqual({
			type: 'conflicts',
			problems: [
				{
					email: 'admin-1@example.com',
					message: 'admin-1@example.com belongs to an admin and cannot be a tenant.'
				}
			]
		});
		expect(await leases()).toHaveLength(0);
		expect(services.auth.createUser).not.toHaveBeenCalled();
	});

	it('Scenario: Tenant on an overlapping lease elsewhere is refused, naming the other property', async () => {
		setup();
		seedLease('other', {
			propertyId: 'prop-2',
			tenantIds: ['tenant-1'],
			startDate: '2026-01-01',
			endDate: '2027-06-30'
		});
		const result = await create(leaseForm({ emails: ['tenant-1@example.com', 'brand@new.com'] }));
		expect(result.status).toBe(400);
		expect(result.data.form.message.problems).toEqual([
			{
				email: 'tenant-1@example.com',
				message:
					'tenant-1@example.com is already on a lease at 9 Oak Ave, Brazil from 2026-01-01 to 2027-06-30.'
			}
		]);
		expect(await leases()).toHaveLength(1);
		expect(services.auth.createUser).not.toHaveBeenCalled();
	});

	it('Scenario: Back-to-back leases are saved', async () => {
		setup();
		seedLease('old', {
			propertyId: 'prop-2',
			tenantIds: ['tenant-1'],
			startDate: '2025-11-01',
			endDate: '2026-10-31'
		});
		const result = await create(leaseForm({ startDate: '2026-11-01' }));
		expect(result.redirect).toBeDefined();
		expect(await leases()).toHaveLength(2);
	});

	it('a conflict that appears while saving is caught in the transaction and undoes new accounts', async () => {
		setup();
		const realTransaction = db.runTransaction.bind(db);
		db.runTransaction = (async (fn: Parameters<typeof db.runTransaction>[0]) => {
			// Another admin puts the new tenant on an overlapping lease just before this save commits.
			seedLease('raced', {
				propertyId: 'prop-2',
				tenantIds: ['new-user-uid'],
				startDate: '2026-01-01'
			});
			return realTransaction(fn);
		}) as typeof db.runTransaction;
		try {
			const result = await create(leaseForm({ emails: ['brand@new.com'] }));
			expect(result.status).toBe(400);
			expect(result.data.form.message.type).toBe('conflicts');
		} finally {
			db.runTransaction = realTransaction;
		}
		expect((await leases()).map((d) => d.id)).toEqual(['raced']);
		expect(services.auth.deleteUser).toHaveBeenCalledWith('new-user-uid');
	});
});

describe('leases: Overlap warning', () => {
	it('Scenario: Overlap at the same property is shown and nothing is saved', async () => {
		setup();
		seedTenant('tenant-2');
		seedLease('existing', {
			tenantIds: ['tenant-2'],
			startDate: '2026-06-01',
			endDate: '2027-05-31'
		});
		const result = await create(leaseForm({}));
		expect(result.status).toBe(409);
		expect(result.data.form.message).toEqual({
			type: 'overlap',
			overlapping: [
				{
					id: 'existing',
					startDate: '2026-06-01',
					endDate: '2027-05-31',
					tenantNames: ['Tom Tenant']
				}
			]
		});
		expect(await leases()).toHaveLength(1);
	});

	it('Scenario: Confirmed saves the lease', async () => {
		setup();
		seedTenant('tenant-2');
		seedLease('existing', { tenantIds: ['tenant-2'], startDate: '2026-06-01' });
		const result = await create(leaseForm({ confirmOverlap: true }));
		expect(result.redirect).toBeDefined();
		expect(await leases()).toHaveLength(2);
	});
});

describe('leases: Edit a lease', () => {
	function setupLease() {
		setup();
		seedTenant('tenant-2');
		seedLease('lease-1', {
			tenantIds: ['tenant-1', 'tenant-2'],
			rent: 1000,
			startDate: '2026-01-01'
		});
	}

	it('loads the lease with its tenants as email rows', async () => {
		setupLease();
		const result = await call(editLoad, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1', leaseId: 'lease-1' }
		});
		expect(result.data.form.data).toMatchObject({
			rent: 1000,
			startDate: '2026-01-01',
			endDate: '',
			emails: ['tenant-1@example.com', 'tenant-2@example.com']
		});
	});

	it('a lease of another property is not found', async () => {
		setupLease();
		const result = await call(editLoad, {
			userID: 'admin-1',
			params: { propertyId: 'prop-2', leaseId: 'lease-1' }
		});
		expect(result.status).toBe(404);
	});

	it('Scenario: Add a tenant: a new email gets an account, the lease and the welcome email', async () => {
		setupLease();
		await edit(
			'lease-1',
			leaseForm({
				rent: '1000',
				startDate: '2026-01-01',
				emails: ['tenant-1@example.com', 'tenant-2@example.com', 'brand@new.com']
			})
		);
		expect(db.peek('leases/lease-1')?.tenantIds).toEqual(['tenant-1', 'tenant-2', 'new-user-uid']);
		expect(services.sendPasswordResetEmail).toHaveBeenCalledWith('brand@new.com', true, {
			address: '1 Main St, Terre Haute',
			startDate: '2026-01-01'
		});
	});

	it('Scenario: Remove a tenant keeps their account', async () => {
		setupLease();
		await edit(
			'lease-1',
			leaseForm({ rent: '1000', startDate: '2026-01-01', emails: ['tenant-1@example.com'] })
		);
		expect(db.peek('leases/lease-1')?.tenantIds).toEqual(['tenant-1']);
		expect(db.peek('users/tenant-2')).toBeDefined();
	});

	it('Scenario: Remove the last tenant is refused', async () => {
		setupLease();
		const result = await edit('lease-1', leaseForm({ emails: [''] }));
		expect(result.status).toBe(400);
		expect(db.peek('leases/lease-1')?.tenantIds).toEqual(['tenant-1', 'tenant-2']);
	});

	it('Scenario: Change the rent keeps recorded history and creation time', async () => {
		setupLease();
		db.seed('leases/lease-1/payment_history/2026', { January: { remainingBalance: 0 } });
		await edit(
			'lease-1',
			leaseForm({
				rent: '1100',
				startDate: '2026-01-01',
				emails: ['tenant-1@example.com', 'tenant-2@example.com']
			})
		);
		expect(db.peek('leases/lease-1')).toMatchObject({
			rent: 1100,
			createdAt: '2026-01-01T00:00:00.000Z'
		});
		expect(db.peek('leases/lease-1/payment_history/2026')).toEqual({
			January: { remainingBalance: 0 }
		});
	});

	it('editing a lease does not count the lease itself as a conflict or an overlap', async () => {
		setupLease();
		const result = await edit(
			'lease-1',
			leaseForm({
				rent: '1000',
				startDate: '2026-02-01',
				emails: ['tenant-1@example.com', 'tenant-2@example.com']
			})
		);
		expect(result.redirect).toBeDefined();
		expect(db.peek('leases/lease-1')?.startDate).toBe('2026-02-01');
	});
});

describe('leases: Lease document', () => {
	it('Scenario: Attach stores the PDF privately and records it on the lease', async () => {
		setup();
		await create(leaseForm({ document: pdfFile() }));
		const [lease] = await leases();
		const document = lease.data().document;
		expect(document).toMatchObject({ fileName: 'lease.pdf', size: PDF.length });
		expect(document.path).toMatch(new RegExp(`^leases/${lease.id}/\\d+\\.pdf$`));
		expect(services.storage.log.written).toEqual([
			{ path: document.path, bytes: PDF, contentType: 'application/pdf' }
		]);
		expect(services.storage.bucket).toHaveBeenCalledWith(`gs://${PUBLIC_FB_STORAGE_BUCKET}`);
	});

	it('Scenario: Attach replaces an earlier document and removes its file', async () => {
		setup();
		services.storage.log.files.set('leases/lease-1/1.pdf', PDF);
		seedLease('lease-1', {
			tenantIds: ['tenant-1'],
			startDate: '2026-11-01',
			document: { path: 'leases/lease-1/1.pdf', fileName: 'old.pdf', size: 3, uploadedAt: 'x' }
		});
		await edit('lease-1', leaseForm({ document: pdfFile(PDF, 'new.pdf') }));
		const document = db.peek('leases/lease-1')?.document as { path: string; fileName: string };
		expect(document.fileName).toBe('new.pdf');
		expect(document.path).not.toBe('leases/lease-1/1.pdf');
		expect(services.storage.log.deleted).toEqual(['leases/lease-1/1.pdf']);
	});

	it('editing without a new file keeps the document', async () => {
		setup();
		const old = { path: 'leases/lease-1/1.pdf', fileName: 'old.pdf', size: 3, uploadedAt: 'x' };
		seedLease('lease-1', { tenantIds: ['tenant-1'], startDate: '2026-11-01', document: old });
		await edit('lease-1', leaseForm({ rent: '1300' }));
		expect(db.peek('leases/lease-1')?.document).toEqual(old);
	});

	it('Scenario: Wrong type is refused and nothing is saved', async () => {
		setup();
		const result = await create(
			leaseForm({ document: pdfFile(new TextEncoder().encode('hello'), 'x.txt', 'text/plain') })
		);
		expect(result.status).toBe(400);
		expect(result.data.form.message).toEqual({
			type: 'document',
			text: 'The lease document must be a PDF.'
		});
		expect(await leases()).toHaveLength(0);
	});

	it('Scenario: A file that claims to be a PDF but is not is refused', async () => {
		setup();
		const result = await create(
			leaseForm({ document: pdfFile(new TextEncoder().encode('<html>'), 'x.pdf') })
		);
		expect(result.data.form.message.text).toBe('The lease document must be a PDF.');
	});

	it('Scenario: Too large (11 MB) is refused', async () => {
		setup();
		const big = new Uint8Array(11 * 1024 * 1024);
		big.set(PDF);
		const result = await create(leaseForm({ document: pdfFile(big) }));
		expect(result.status).toBe(400);
		expect(result.data.form.message.text).toBe('The lease document must be 10 MB or smaller.');
		expect(services.storage.log.written).toHaveLength(0);
	});

	it('a failed save removes the uploaded file', async () => {
		setup();
		const realTransaction = db.runTransaction.bind(db);
		db.runTransaction = (async () => {
			throw new Error('Firestore unavailable');
		}) as typeof db.runTransaction;
		try {
			await create(leaseForm({ document: pdfFile() }));
		} finally {
			db.runTransaction = realTransaction;
		}
		expect(services.storage.log.files.size).toBe(0);
	});
});

describe('leases: saving races and stale records (review round 1)', () => {
	it('an edit of a lease deleted meanwhile answers 404 and does not recreate it', async () => {
		setup();
		seedLease('lease-1', { tenantIds: ['tenant-1'], startDate: '2026-11-01' });
		const realTransaction = db.runTransaction.bind(db);
		db.runTransaction = (async (fn: Parameters<typeof db.runTransaction>[0]) => {
			db.remove('leases/lease-1');
			return realTransaction(fn);
		}) as typeof db.runTransaction;
		try {
			const result = await edit(
				'lease-1',
				leaseForm({ emails: ['tenant-1@example.com', 'x@new.com'] })
			);
			expect(result.status).toBe(404);
		} finally {
			db.runTransaction = realTransaction;
		}
		expect(db.peek('leases/lease-1')).toBeUndefined();
		expect(db.peek('users/new-user-uid')).toBeUndefined();
	});

	it('an edit without a new file keeps a document another admin attached meanwhile', async () => {
		setup();
		seedLease('lease-1', { tenantIds: ['tenant-1'], startDate: '2026-11-01' });
		const attached = {
			path: 'leases/lease-1/9.pdf',
			fileName: 'other.pdf',
			size: 1,
			uploadedAt: 'x'
		};
		const realTransaction = db.runTransaction.bind(db);
		db.runTransaction = (async (fn: Parameters<typeof db.runTransaction>[0]) => {
			db.seed('leases/lease-1', { ...db.peek('leases/lease-1'), document: attached });
			return realTransaction(fn);
		}) as typeof db.runTransaction;
		try {
			await edit('lease-1', leaseForm({ rent: '1300' }));
		} finally {
			db.runTransaction = realTransaction;
		}
		expect(db.peek('leases/lease-1')).toMatchObject({ rent: 1300, document: attached });
	});

	it('the edit page counts tenants whose account no longer exists', async () => {
		setup();
		seedLease('lease-1', { tenantIds: ['tenant-1', 'gone-user'], startDate: '2026-01-01' });
		const result = await call(editLoad, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1', leaseId: 'lease-1' }
		});
		expect(result.data.lease.missingTenants).toBe(1);
		expect(result.data.form.data.emails).toEqual(['tenant-1@example.com']);
	});
});

describe('leases: Lease document route (GET /api/lease/{id}/document)', () => {
	function setupDocument() {
		setup();
		seedTenant('tenant-2');
		services.storage.log.files.set('leases/lease-1/1.pdf', PDF);
		seedLease('lease-1', {
			tenantIds: ['tenant-1'],
			startDate: '2026-01-01',
			document: {
				path: 'leases/lease-1/1.pdf',
				fileName: 'lease.pdf',
				size: PDF.length,
				uploadedAt: 'x'
			}
		});
	}
	const fetchAs = (userID: string | null, leaseId = 'lease-1') =>
		call(getDocument, { userID, method: 'GET', params: { leaseId } });

	it('Scenario: Tenant on the lease gets the PDF, inline and not cached', async () => {
		setupDocument();
		const result = await getDocument({
			params: { leaseId: 'lease-1' },
			locals: { userID: 'tenant-1' }
		} as never);
		expect(result.status).toBe(200);
		expect(result.headers.get('content-type')).toBe('application/pdf');
		expect(result.headers.get('content-disposition')).toBe('inline; filename="lease.pdf"');
		expect(result.headers.get('cache-control')).toBe('private, no-store');
		expect(new Uint8Array(await result.arrayBuffer())).toEqual(PDF);
	});

	it('an admin gets the PDF', async () => {
		setupDocument();
		expect((await fetchAs('admin-1')).status).toBe(200);
	});

	it('Scenario: Other tenant is refused with 403', async () => {
		setupDocument();
		const result = await fetchAs('tenant-2');
		expect(result.status).toBe(403);
	});

	it('an unknown lease answers 403 too, so lease ids cannot be probed', async () => {
		setupDocument();
		expect((await fetchAs('tenant-2', 'nope')).status).toBe(403);
	});

	it('an anonymous caller is refused with 401', async () => {
		setupDocument();
		expect((await fetchAs(null)).status).toBe(401);
	});

	it('a document record whose file is gone answers 404', async () => {
		setupDocument();
		services.storage.log.files.clear();
		expect((await fetchAs('tenant-1')).status).toBe(404);
	});

	it('a lease without a document answers 404', async () => {
		setup();
		seedLease('lease-2', { tenantIds: ['tenant-1'], startDate: '2026-01-01' });
		expect((await fetchAs('tenant-1', 'lease-2')).status).toBe(404);
	});
});

describe('leases: Delete a lease (DELETE /api/lease/{id})', () => {
	const remove = (userID: string, leaseId = 'lease-1') =>
		call(deleteLease, { userID, method: 'DELETE', params: { leaseId } });

	it('Scenario: No payments: the lease and its document are removed', async () => {
		setup();
		services.storage.log.files.set('leases/lease-1/1.pdf', PDF);
		seedLease('lease-1', { tenantIds: ['tenant-1'], startDate: '2026-01-01' });
		const result = await remove('admin-1');
		expect(result.status).toBe(200);
		expect(db.peek('leases/lease-1')).toBeUndefined();
		expect(services.storage.log.deletedPrefixes).toEqual(['leases/lease-1/']);
		expect(services.storage.log.files.size).toBe(0);
	});

	it('Scenario: Has payments: 409, nothing removed, and the admin is told to set an end date', async () => {
		setup();
		seedLease('lease-1', { tenantIds: ['tenant-1'], startDate: '2026-01-01' });
		db.seed('leases/lease-1/payment_history/2026', { January: { remainingBalance: 0 } });
		const result = await remove('admin-1');
		expect(result.status).toBe(409);
		expect(result.error).toMatch(/Set an end date instead/);
		expect(db.peek('leases/lease-1')).toBeDefined();
	});

	it('a non-admin is rejected with 401 and nothing is removed', async () => {
		setup();
		seedLease('lease-1', { tenantIds: ['tenant-1'], startDate: '2026-01-01' });
		expect((await remove('tenant-1')).status).toBe(401);
		expect(db.peek('leases/lease-1')).toBeDefined();
	});

	it('an unknown lease answers 404', async () => {
		setup();
		expect((await remove('admin-1', 'nope')).status).toBe(404);
	});
});

describe('leases: Admin lease list (property edit page)', () => {
	it('Scenario: Property with leases lists them newest first, with status, rent and tenants', async () => {
		setup();
		seedLease('ended', {
			tenantIds: ['tenant-1'],
			startDate: '2020-01-01',
			endDate: '2020-12-31',
			rent: 1000
		});
		seedLease('current', { tenantIds: ['tenant-1'], startDate: '2021-01-01', rent: 1100 });
		const result = await call(propertyEditLoad, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1' }
		});
		expect(result.data.leases).toEqual([
			{
				id: 'current',
				propertyId: 'prop-1',
				rent: 1100,
				startDate: '2021-01-01',
				endDate: null,
				status: 'current',
				tenants: [{ id: 'tenant-1', name: 'Tom Tenant', email: 'tenant-1@example.com' }],
				hasDocument: false
			},
			expect.objectContaining({ id: 'ended', status: 'ended', rent: 1000 })
		]);
	});

	it('Scenario: Property with no leases has an empty list', async () => {
		setup();
		const result = await call(propertyEditLoad, {
			userID: 'admin-1',
			params: { propertyId: 'prop-1' }
		});
		expect(result.data.leases).toEqual([]);
	});
});
