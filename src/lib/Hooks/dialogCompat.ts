// Compatibility layer for Dialog/Modal store (Skeleton v2 to v4 migration)
// In Skeleton v4, dialogs are managed through component state using Zag.js
// This provides a compatibility shim for the old store-based API

import { writable, type Readable } from 'svelte/store';
import type { Component } from 'svelte';

export type DialogSettings = {
	type: 'component' | 'confirm' | 'alert' | 'prompt';
	component?: Component;
	title?: string;
	body?: string;
	callback?: (result: boolean) => void;
	response?: (result: string | boolean) => void;
	valueAttr?: Record<string, unknown>;
	buttonTextCancel?: string;
};

export type DialogStore = {
	trigger: (settings: DialogSettings) => void;
	close: () => void;
	subscribe: Readable<DialogSettings | null>['subscribe'];
};

// Create a writable store to hold dialog state
const dialogState = writable<DialogSettings | null>(null);

export function getDialogStore(): DialogStore {
	return {
		subscribe: dialogState.subscribe,
		trigger: (settings: DialogSettings) => {
			dialogState.set(settings);
		},
		close: () => {
			dialogState.set(null);
		}
	};
}
