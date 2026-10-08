import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { adminDB } from '$lib/server/admin';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { loadBalance } from '$lib/server/balance';

export const load = (async (event) => {
	const uid = getUserIdOrError(event.locals.userID);

	const { userProperty } = await event.parent();

	// A tenant without a property has nothing to pay; the dashboard explains why.
	if (!userProperty) {
		throw redirect(303, '/');
	}

	const junction = await adminDB
		.collection('junction_user_property')
		.doc(`${uid}_${userProperty.id}`)
		.get();

	const { balanceCents, dueDate } = await loadBalance(
		userProperty.id,
		userProperty.data.rent,
		junction.data()?.moveInMonth
	);

	return { balanceCents, dueDate };
}) satisfies PageServerLoad;
