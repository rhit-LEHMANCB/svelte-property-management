import type * as toast from '@zag-js/toast';

let toaster: toast.Store<any> | null = null;

export function setToaster(t: toast.Store<any>) {
	toaster = t;
}

export function successToast(message: string) {
	if (toaster) {
		toaster.create({
			title: 'Success',
			description: message,
			type: 'success'
		});
	}
}

export function errorToast(message: string) {
	if (toaster) {
		toaster.create({
			title: 'Error',
			description: message,
			type: 'error'
		});
	}
}
