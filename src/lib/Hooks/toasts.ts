// Toast notifications helper functions
// In Skeleton v4, Toast management is handled through the Toast component
// These functions now simply return toast configuration that can be displayed

export type ToastSettings = {
	message: string;
	background?: string;
	type?: 'success' | 'error' | 'info' | 'warning';
};

export function successToast(message: string) {
	return {
		message,
		type: 'success' as const,
		background: 'variant-filled-success'
	};
}

export function errorToast(message: string) {
	return {
		message,
		type: 'error' as const,
		background: 'variant-filled-error'
	};
}
