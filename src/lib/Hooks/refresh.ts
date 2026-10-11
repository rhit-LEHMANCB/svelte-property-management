import { invalidateAll } from '$app/navigation';
import { writable } from 'svelte/store';

/** True while `refresh` reloads the page data; lists show placeholders meanwhile. */
export const refreshing = writable(false);

/** Reloads the current page's data after a change, marking lists as loading until it arrives. */
export async function refresh() {
	refreshing.set(true);
	try {
		await invalidateAll();
	} finally {
		refreshing.set(false);
	}
}
