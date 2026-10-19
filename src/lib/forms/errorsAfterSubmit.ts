import { derived, writable, type Readable } from 'svelte/store';

/**
 * Field errors are shown only once the form has been submitted, then follow the form's live
 * validation. A form the server already answered (a post without scripts) counts as submitted.
 * Create the gate before the form, pass `markSubmitted` as its `onSubmit`, then gate its errors.
 */
export function errorsAfterSubmit(posted = false) {
	const submitted = writable(posted);
	return {
		/** Call from the form's `onSubmit`. */
		markSubmitted: () => submitted.set(true),
		/** Call after a successful save that clears the form. */
		reset: () => submitted.set(false),
		/** The errors to render: empty until the first submit. */
		shown: <T extends object>(errors: Readable<T>) =>
			derived([errors, submitted], ([$errors, $submitted]) => ($submitted ? $errors : ({} as T)))
	};
}
