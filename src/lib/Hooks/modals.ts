import type { DialogComponent, DialogSettings, DialogStore } from '@skeletonlabs/skeleton-svelte';
import type { DocumentWithId } from '../../app';
import UserInfoModal from '$lib/Components/Users/UserInfoModal.svelte';

export function viewUserInfoModal(user: DocumentWithId, dialogStore: DialogStore) {
	const dialogComponent: DialogComponent = { ref: UserInfoModal, props: { user } };
	const dialog: DialogSettings = {
		type: 'component',
		component: dialogComponent
	};
	dialogStore.trigger(dialog);
}
