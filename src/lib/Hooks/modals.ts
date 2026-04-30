// Dialog/Modal helper - In Skeleton v4, dialogs are managed differently
// This is a simplified version that will need to be refactored to use the new Dialog component API

import type { DocumentWithId } from '../../app';
import { type DialogStore, type DialogSettings } from './dialogCompat';

export type { DialogSettings, DialogStore };

export function viewUserInfoModal(user: DocumentWithId, dialogStore: DialogStore) {
	const settings: DialogSettings = {
		type: 'component',
		title: 'User Info',
		body: `Viewing details for ${user.data.firstName} ${user.data.lastName}`
	};
	dialogStore.trigger(settings);
}

// Placeholder store - in a real v4 implementation, you'd use the useDialog hook in components
export function createDialogStore(): Omit<DialogStore, 'subscribe'> {
	return {
		trigger: (settings: DialogSettings) => {
			console.warn('Dialog trigger called:', settings);
		},
		close: () => {
			console.warn('Dialog close called');
		}
	};
}
