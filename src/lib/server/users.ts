import { adminAuth, adminDB } from './admin';
import { sendPasswordResetEmail } from './email';
import { stripe } from './stripe';

export type CreatedAccount = {
	uid: string;
	/** Removes everything this account creation made, newest first. Never throws. */
	undo: () => Promise<void>;
};

async function runUndo(steps: (() => Promise<unknown>)[]) {
	for (const step of [...steps].reverse()) {
		await step().catch((undoError) =>
			console.log(
				'Rollback step failed:',
				undoError instanceof Error ? undoError.message : undoError
			)
		);
	}
}

/**
 * Creates a tenant account: the Auth user, a Stripe customer, and `users/{uid}` with the placeholder
 * name "New User". With `sendWelcome`, it also sends the welcome email. If any step fails, the steps
 * already done are undone and the error is rethrown, so nothing is left behind.
 */
export async function createTenantAccount(
	email: string,
	options: { sendWelcome: boolean }
): Promise<CreatedAccount> {
	const undo: (() => Promise<unknown>)[] = [];
	try {
		const userRecord = await adminAuth.createUser({ email: email });
		undo.push(() => adminAuth.deleteUser(userRecord.uid));

		const stripeCustomer = await stripe.customers.create({
			name: 'New User',
			email: email
		});
		undo.push(() => stripe.customers.del(stripeCustomer.id));

		const userDoc = adminDB.collection('users').doc(userRecord.uid);
		await userDoc.set({
			email: email,
			firstName: 'New',
			lastName: 'User',
			phoneNumber: '',
			permissions: 'user',
			stripeID: stripeCustomer.id
		});
		undo.push(() => userDoc.delete());

		if (options.sendWelcome) {
			await sendPasswordResetEmail(email, true);
		}

		return { uid: userRecord.uid, undo: () => runUndo(undo) };
	} catch (err) {
		await runUndo(undo);
		throw err;
	}
}
