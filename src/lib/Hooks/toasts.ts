import type { ToastStore } from '$lib/ui';

export function successToast(message: string, toastStore: ToastStore) {
	toastStore.trigger({ message, type: 'success' });
}

export function errorToast(message: string, toastStore: ToastStore) {
	toastStore.trigger({ message, type: 'error' });
}
