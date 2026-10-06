import { getContext, setContext, type Component } from 'svelte';
import { writable } from 'svelte/store';

// Local replacements for the toast, modal and drawer stores Skeleton 2 shipped. Skeleton 5 only
// provides CSS and low-level components, so the app keeps the small store API its pages already use.

export type ToastSettings = {
	message: string;
	/** Tailwind classes for the toast color, for example `preset-filled-success-500`. */
	background?: string;
	/** Milliseconds until the toast closes itself. */
	timeout?: number;
};
export type Toast = ToastSettings & { id: string };

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
	const { subscribe, update, set } = writable<Toast[]>([]);
	function close(id: string) {
		update((toasts) => toasts.filter((toast) => toast.id !== id));
	}
	return {
		subscribe,
		trigger(settings: ToastSettings) {
			const id = crypto.randomUUID();
			update((toasts) => [...toasts, { ...settings, id }]);
			setTimeout(() => close(id), settings.timeout ?? DEFAULT_TOAST_TIMEOUT);
			return id;
		},
		close,
		clear: () => set([])
	};
}

function createModalStore() {
	const { subscribe, update, set } = writable<ModalSettings[]>([]);
	return {
		subscribe,
		trigger(settings: ModalSettings) {
			update((modals) => [...modals, settings]);
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
