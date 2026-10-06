import type { ToastSettings, ToastStore } from '#lib/ui';

export function successToast(message: string, toastStore: ToastStore) {
	const successToast: ToastSettings = {
		message: message,
		// Provide any utility or preset background style:
		background: 'preset-filled-success-500'
	};
	toastStore.trigger(successToast);
}

export function errorToast(message: string, toastStore: ToastStore) {
	const errorToast: ToastSettings = {
		message: message,
		// Provide any utility or preset background style:
		background: 'preset-filled-error-500'
	};
	toastStore.trigger(errorToast);
}
