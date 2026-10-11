import { getContext, setContext, type Component } from 'svelte';
import { writable } from 'svelte/store';
import { createToaster } from '@skeletonlabs/skeleton-svelte';

// The app's imperative modal, toast and drawer API. Pages call `trigger`; ModalHost and ToastHost
// render the queued items with Skeleton's Dialog and Toast components.

export type ToastSettings = {
	message: string;
	/** `error` is announced as an alert, the others as a status message. */
	type?: 'success' | 'error' | 'info';
	/** Milliseconds until the toast closes itself. */
	timeout?: number;
};

export type ModalComponent = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ref: Component<any>;
	props?: Record<string, unknown>;
};

export type ModalSettings = {
	type: 'alert' | 'confirm' | 'prompt' | 'component';
	title?: string;
	/** Plain text shown under the title; line breaks are kept. Never rendered as HTML. */
	body?: string;
	/** Initial value of the prompt input. */
	value?: string;
	/** Attributes for the prompt input, for example `{ type: 'number', step: '0.01' }`. */
	valueAttr?: Record<string, string | number | boolean>;
	buttonTextCancel?: string;
	buttonTextConfirm?: string;
	buttonTextSubmit?: string;
	component?: ModalComponent;
	/** Called with `true` or the prompt value on confirm, and `false` when the modal is dismissed. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	response?: (response: any) => void;
};

const DEFAULT_TOAST_TIMEOUT = 5000;

function createToastStore() {
	const toaster = createToaster({ placement: 'bottom', overlap: false, gap: 8 });
	return {
		toaster,
		trigger(settings: ToastSettings) {
			return toaster.create({
				description: settings.message,
				type: settings.type ?? 'info',
				duration: settings.timeout ?? DEFAULT_TOAST_TIMEOUT
			});
		},
		close: (id: string) => toaster.dismiss(id),
		clear: () => toaster.dismiss()
	};
}

function createModalStore() {
	const { subscribe, update, set } = writable<ModalSettings[]>([]);
	return {
		subscribe,
		trigger(settings: ModalSettings) {
			// A copy, so triggering the same settings object twice queues two distinct modals.
			update((modals) => [...modals, { ...settings }]);
		},
		/** Closes the front modal without calling its response callback. */
		close() {
			update((modals) => modals.slice(1));
		},
		clear: () => set([])
	};
}

function createDrawerStore() {
	const { subscribe, set } = writable(false);
	return {
		subscribe,
		set,
		open: () => set(true),
		close: () => set(false)
	};
}

export type ToastStore = ReturnType<typeof createToastStore>;
export type ModalStore = ReturnType<typeof createModalStore>;
export type DrawerStore = ReturnType<typeof createDrawerStore>;

type Stores = { toast: ToastStore; modal: ModalStore; drawer: DrawerStore };
const STORES = Symbol('ui-stores');

/** Creates the stores for this app instance; call once in the root layout. */
export function initializeStores() {
	setContext<Stores>(STORES, {
		toast: createToastStore(),
		modal: createModalStore(),
		drawer: createDrawerStore()
	});
}

const stores = () => getContext<Stores>(STORES);
export const getToastStore = () => stores().toast;
export const getModalStore = () => stores().modal;
export const getDrawerStore = () => stores().drawer;
