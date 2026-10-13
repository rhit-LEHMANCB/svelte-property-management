// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			userID: string | null;
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export interface DocumentWithId {
	id: string;
	data: FirebaseFirestore.DocumentData;
	/** On the admin users list: the property of the user's current lease, if any. */
	property?: { id: string; address: string } | null;
}

export interface PhotoItem {
	id: string;
	photoUrl: string;
}

export interface MaintenanceRequest {
	id: string;
	subject: string;
	description: string;
	workDone?: string;
	propertyId: string;
	propertyAddress: string;
	status: string;
	dateAdded?: Date;
	dateClosed?: Date;
	submitter: string;
}
