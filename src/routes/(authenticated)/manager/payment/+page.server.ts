import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { adminDB } from '$lib/server/admin';

export const load = (async (event) => {
    if (!event.locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}

	const { userProperty } = await event.parent();

	if (!userProperty) {
		throw error(500, 'Failed to find property info.');
	}

    const lease =
        (await adminDB
            .collection('leases')
            .where('propertyId', '==', userProperty.id).where('').get()).docs;

    
    return {};
}) satisfies PageServerLoad;