import { error } from '@sveltejs/kit';
import { adminDB } from './admin';

export const getUserIdOrError = (userId: string | null) => {
	if (!userId) {
		throw error(401, 'You must be logged in to do this.');
	}

	return userId;
};

export const getAdminUserDataOrError = async (userId: string) => {
	const userData = (await adminDB.collection('users').doc(userId).get()).data();

	if (!userData || !userData.permissions || userData.permissions !== 'admin') {
		throw error(401, 'You must be an admin to do this.');
	}

	return userData;
};

export const getUserDataOrError = async (userId: string) => {
	const userData = (await adminDB.collection('users').doc(userId).get()).data();

	if (!userData) {
		throw error(401, 'Failed to retrieve user details');
	}

	return userData;
};
