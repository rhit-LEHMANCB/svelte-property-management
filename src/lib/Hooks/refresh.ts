import { invalidateAll } from '$app/navigation';
import { derived, writable } from 'svelte/store';

const pending = writable(0);

/** True while any `refresh` is reloading the page data; lists show placeholders meanwhile. */
export const refreshing = derived(pending, (count) => count > 0);

/** Reloads the current page's data after a change, marking lists as loading until it arrives. */
export async function refresh() {
	pending.update((count) => count + 1);
	try {
		await invalidateAll();
	} finally {
		pending.update((count) => count - 1);
	}
}
