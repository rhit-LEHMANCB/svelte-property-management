import type { DocumentWithId } from '../../app';

export function openUserInfoModal(
	user: DocumentWithId,
	modalState: { open: boolean; user: DocumentWithId | null }
) {
	modalState.user = user;
	modalState.open = true;
}
