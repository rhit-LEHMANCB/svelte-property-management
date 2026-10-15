import { fail, isHttpError, redirect, type RequestEvent } from '@sveltejs/kit';
import { message, setError, superValidate, type SuperValidated } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { leaseSchema, type LeaseInput } from '$lib/schemas';
import { getAdminUserDataOrError, getUserIdOrError } from './authHelpers';
import { saveLease } from './leases';
import { defaultLateFee } from '$lib/lateFee';
import type { LeaseFormMessage } from '$lib/leaseTypes';

export type { LeaseFormMessage };

export type LeaseForm = SuperValidated<LeaseInput, LeaseFormMessage>;

/**
 * The create and edit form action. A clean save goes back to the property's Leases tab; anything
 * the admin must see (conflicts, an overlap to confirm, a bad file, welcome emails that failed)
 * comes back as the form's message.
 */
export async function leaseFormAction(
	event: RequestEvent<{ propertyId: string; leaseId?: string }>
) {
	const userId = getUserIdOrError(event.locals.userID);
	await getAdminUserDataOrError(userId);

	const formData = await event.request.formData();
	const form = await superValidate<LeaseInput, LeaseFormMessage>(formData, zod(leaseSchema));
	if (!form.valid) return fail(400, { form });

	const document = formData.get('document');
	let result: Awaited<ReturnType<typeof saveLease>>;
	try {
		result = await saveLease({
			propertyId: event.params.propertyId,
			leaseId: event.params.leaseId,
			input: form.data,
			document: document instanceof File ? document : null
		});
	} catch (err) {
		if (isHttpError(err)) throw err;
		console.log('Saving the lease failed', err instanceof Error ? err.message : err);
		return message(
			form,
			{
				type: 'error',
				text: 'The lease could not be saved and nothing was changed. Please try again.'
			},
			{ status: 500 }
		);
	}

	switch (result.kind) {
		case 'conflicts':
			return message(form, { type: 'conflicts', problems: result.problems }, { status: 400 });
		case 'overlap':
			return message(form, { type: 'overlap', overlapping: result.overlapping }, { status: 409 });
		case 'documentError':
			return message(form, { type: 'document', text: result.message }, { status: 400 });
		case 'depositBelowPaid':
			return setError(
				form,
				'deposit',
				`The deposit cannot be less than the ${currency.format(result.paid)} already paid.`
			);
		case 'saved':
			if (result.emailFailures.length > 0) {
				return message(form, {
					type: 'emailFailures',
					emails: result.emailFailures,
					leaseId: result.leaseId
				});
			}
			throw redirect(303, `/admin/properties/${event.params.propertyId}/edit?tab=leases`);
	}
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export async function emptyLeaseForm(initial: Partial<LeaseInput>) {
	return superValidate<LeaseInput, LeaseFormMessage>(
		{
			rent: undefined,
			startDate: '',
			endDate: '',
			emails: [''],
			deposit: undefined,
			depositDueDate: '',
			lateFee: initial.rent !== undefined ? defaultLateFee(initial.rent) : undefined,
			graceDays: 5,
			confirmOverlap: false,
			...initial
		},
		zod(leaseSchema),
		{ errors: false }
	);
}
