import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms/server';
import { insuranceSchema } from '$lib/schemas';
import { adminDB } from '$lib/server/admin';
import { formatDate } from '$lib/DatePicker/date-utils';

export const load = (async (event) => {
	if (!event.locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}

	const insuranceDataRaw = (await adminDB.collection('users').doc(event.locals.userID).get()).data()
		?.insurance;

	let insuranceData:
		| { companyName: string; policyNumber: string; startDate: Date; endDate: Date }
		| undefined;
	if (insuranceDataRaw) {
		insuranceData = {
			companyName: insuranceDataRaw.companyName,
			policyNumber: insuranceDataRaw.policyNumber,
			startDate: new Date(insuranceDataRaw.startDate),
			endDate: new Date(insuranceDataRaw.endDate)
		};
	} else {
		insuranceData = undefined;
	}

	const form = await superValidate(insuranceData, insuranceSchema);

	return {
		form
	};
}) satisfies PageServerLoad;

export const actions = {
	default: async (event) => {
		const form = await superValidate(event, insuranceSchema);

		if (!event.locals.userID) {
			throw error(401, 'You must be logged in to do this.');
		}

		if (!form.valid) {
			return message(form, 'Invalid form');
		}

		await adminDB
			.collection('users')
			.doc(event.locals.userID)
			.update({
				insurance: {
					...form.data,
					startDate: formatDate(form.data.startDate),
					endDate: formatDate(form.data.endDate)
				}
			});

		return message(form, 'Form submitted');
	}
};
