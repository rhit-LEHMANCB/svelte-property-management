<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { formatDate } from './date-utils';

	let {
		value = $bindable(),
		name = '',
		title = '',
		invalid = false,
		...rest
	}: {
		value: Date;
		name?: string;
		title?: string;
		/** Shows the error outline; the message itself is rendered by the surrounding Field. */
		invalid?: boolean;
	} & Omit<HTMLInputAttributes, 'value' | 'type'> = $props();

	const onChange = (newValue: string) => {
		value = new Date(newValue.replace(/-/g, '/'));
	};

	const convertedValue = $derived(value ? formatDate(value) : '');
</script>

<input
	{...rest}
	{name}
	oninput={(e) => onChange(e.currentTarget.value)}
	value={convertedValue}
	class="input"
	class:input-error={invalid}
	{title}
	type="date"
/>
