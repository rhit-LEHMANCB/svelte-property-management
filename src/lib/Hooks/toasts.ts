import type { ToastSettings, ToastStore } from '@skeletonlabs/skeleton-svelte';

export function successToast(message: string, toastStore: ToastStore) {
	const successToast: ToastSettings = {
		message: message,
		background: 'variant-filled-success'
	};
	toastStore.trigger(successToast);
}

export function errorToast(message: string, toastStore: ToastStore) {
	const errorToast: ToastSettings = {
		message: message,
		background: 'variant-filled-error'
	};
	toastStore.trigger(errorToast);
}
