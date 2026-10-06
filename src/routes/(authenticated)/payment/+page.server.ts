import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { adminDB } from '$lib/server/admin';
import { getUserIdOrError } from '$lib/server/authHelpers';
import { loadBalance } from '$lib/server/balance';

export const load = (async (event) => {
	const uid = getUserIdOrError(event.locals.userID);

	const { userProperty } = await event.parent();

	if (!userProperty) {
		throw error(500, 'Failed to find property info.');
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
