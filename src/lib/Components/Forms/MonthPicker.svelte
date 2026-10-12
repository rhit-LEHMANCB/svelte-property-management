<script lang="ts">
	import { MONTH_OPTIONS, splitMonthKey, yearOptions } from './monthPicker';

	let {
		value = $bindable(''),
		label,
		labelledby,
		onchange,
		class: className = ''
	}: {
		/** A `YYYY-MM` month key, or empty until both a month and a year are chosen. */
		value?: string;
		/** Accessible name of the group, when no visible label names it through `labelledby`. */
		label?: string;
		labelledby?: string;
		/**
		 * Called when the user picks a complete month. Return false (for example when saving
		 * failed) to put the pickers back to `value`.
		 */
		onchange?: (value: string) => boolean | void | Promise<boolean | void>;
		class?: string;
	} = $props();

	let month = $state(splitMonthKey(value).month);
	let year = $state(splitMonthKey(value).year);
	const years = $derived(yearOptions(value));

	// Follow changes from the parent, such as a reset after adding or a refresh after saving.
	$effect.pre(() => {
		const parts = splitMonthKey(value);
		month = parts.month;
		year = parts.year;
	});

	async function choose() {
		if (!month || !year) return;
		const next = `${year}-${month}`;
		if (next === value) return;
		const previous = value;
		value = next;
		if ((await onchange?.(next)) === false) {
			value = previous;
			const parts = splitMonthKey(previous);
			month = parts.month;
			year = parts.year;
		}
	}
</script>

<!-- Two selects rather than <input type="month">, which Firefox and desktop Safari show as a text box. -->
<div
	role="group"
	aria-label={labelledby ? undefined : label}
	aria-labelledby={labelledby}
	class="flex gap-2 {className}"
>
	<select class="select w-36" aria-label="Month" bind:value={month} onchange={choose}>
		{#if !month}<option value="" disabled>Month</option>{/if}
		{#each MONTH_OPTIONS as option (option.value)}
			<option value={option.value}>{option.name}</option>
		{/each}
	</select>
	<select class="select w-24" aria-label="Year" bind:value={year} onchange={choose}>
		{#if !year}<option value="" disabled>Year</option>{/if}
		{#each years as option (option)}
			<option value={option}>{option}</option>
		{/each}
	</select>
</div>
