<script lang="ts" module>
	/** Attributes to spread onto the field's control so its error is linked and announced. */
	export type FieldAttrs = {
		id: string;
		'aria-invalid': 'true' | undefined;
		'aria-describedby': string | undefined;
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		hint,
		errors,
		id,
		describedBy,
		srOnlyLabel = false,
		class: className = '',
		children
	}: {
		label: string;
		/** Extra text after the label, for example "(optional)". */
		hint?: string;
		/** The field's errors; the first one is shown under the control. */
		errors?: string[] | null;
		id?: string;
		/** Ids of help text that always describes the control, such as password rules. */
		describedBy?: string;
		/** Keeps the label for screen readers only, for controls labelled by their surroundings. */
		srOnlyLabel?: boolean;
		class?: string;
		children: Snippet<[{ attrs: FieldAttrs; invalid: boolean }]>;
	} = $props();

	const uid = $props.id();
	const fieldId = $derived(id ?? `${uid}-field`);
	const message = $derived(errors?.[0]);
	const attrs = $derived<FieldAttrs>({
		id: fieldId,
		'aria-invalid': message ? 'true' : undefined,
		'aria-describedby':
			[message ? `${fieldId}-error` : '', describedBy ?? ''].filter(Boolean).join(' ') || undefined
	});
</script>

<div class="label {className}" data-field>
	<label for={fieldId} class="label-text" class:sr-only={srOnlyLabel}>
		{label}
		{#if hint}<span class="opacity-70">{hint}</span>{/if}
	</label>
	{@render children({ attrs, invalid: !!message })}
	{#if message}
		<p id="{fieldId}-error" class="text-error-800-200 text-sm" data-field-error>{message}</p>
	{/if}
</div>
