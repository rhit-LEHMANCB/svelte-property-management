import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminAuth, adminDB } from '$lib/server/admin';
import { sendPasswordResetEmail } from '$lib/server/email';
import { stripe } from '$lib/server/stripe';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.userID) {
		throw error(401, 'You must be logged in to do this.');
	}

	const userData = (await adminDB.collection('users').doc(locals.userID).get()).data();

	if (!userData || !userData.permissions || userData.permissions !== 'admin') {
		throw error(401, 'You must be an admin to do this.');
	}

	const { email } = await request.json();

	const userRecord = await adminAuth.createUser({ email: email }).catch((err) => {
		console.log(err.message);
		throw error(500, err);
	});

	const stripeCustomer = await stripe.customers.create({
		name: 'New User',
		email: email
	});

	const newUserDoc = {
		email: email,
		firstName: 'New',
		lastName: 'User',
		phoneNumber: '',
		permissions: 'user',
		stripeID: stripeCustomer.id
	};

	return adminDB
		.collection('users')
		.doc(userRecord.uid)
		.set(newUserDoc)
		.then(() => {
			sendPasswordResetEmail(email, true);
			return json({ status: 'New User Created' });
		})
		.catch((err) => {
			console.log(err.message);
			throw error(500, err);
		});
};
