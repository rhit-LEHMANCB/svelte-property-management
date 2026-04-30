<script lang="ts">
	import { formatDate } from './date-utils';

	let {
		value = $bindable(),
		name = '',
		title = '',
		errors
	} = $props<{
		value: Date;
		name?: string;
		title?: string;
		errors?: string[];
	}>();

	const onChange = (newValue: string) => {
		value = new Date(newValue.replace(/-/g, '/'));
	};

	let convertedValue = $derived(value ? formatDate(value) : '');
</script>

<input
	{name}
	oninput={(e) => onChange(e.currentTarget.value)}
	value={convertedValue}
	class="input"
	class:input-error={errors}
	{title}
	type="date"
/>
