import type { ModalComponent, ModalSettings, ModalStore } from '#lib/ui';
import type { DocumentWithId } from '../../app';
import UserInfoModal from '#lib/Components/Users/UserInfoModal.svelte';

export function viewUserInfoModal(user: DocumentWithId, modalStore: ModalStore) {
	const modalComponent: ModalComponent = { ref: UserInfoModal, props: { user } };
	const modal: ModalSettings = {
		type: 'component',
		// Data
		component: modalComponent
	};
	modalStore.trigger(modal);
}
