<script lang="ts" module>
	export type PickerOption = { label: string; value: string };
</script>

<script lang="ts">
	import { Combobox, Portal, useListCollection } from '@skeletonlabs/skeleton-svelte';
	import { IconSelector } from '@tabler/icons-svelte';

	let {
		options,
		label,
		placeholder = 'Search...',
		selected = $bindable(),
		class: className = ''
	}: {
		options: PickerOption[];
		label: string;
		placeholder?: string;
		/** The chosen option. Typing over it unsets it; call `clear()` to empty the field. */
		selected?: PickerOption;
		/** Classes for the root, for example to place it in a parent grid. */
		class?: string;
	} = $props();

	let inputValue = $state('');
	let query = $state('');

	const matches = $derived(
		options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))
	);
	const collection = $derived(
		useListCollection({
			items: matches,
			itemToString: (option) => option.label,
			itemToValue: (option) => option.value
		})
	);

	/** Empties the field and the selection, for example after the parent has used the choice. */
	export function clear() {
		selected = undefined;
		inputValue = '';
		query = '';
	}
</script>

<!-- Combobox: type to filter, arrow keys to move, Enter to choose, Escape to close. -->
<Combobox
	{collection}
	{inputValue}
	value={selected ? [selected.value] : []}
	openOnClick
	onInputValueChange={(details) => {
		inputValue = details.inputValue;
		if (details.reason === 'input-change') {
			query = details.inputValue;
			if (selected && details.inputValue !== selected.label) selected = undefined;
		}
	}}
	onValueChange={(details) => {
		selected = details.items[0];
		query = '';
	}}
	class="w-full {className}"
>
	<Combobox.Label class="label-text">{label}</Combobox.Label>
	<Combobox.Control class="relative">
		<Combobox.Input class="input pe-11" {placeholder} />
		<Combobox.Trigger
			class="btn-icon btn-icon-sm hover:preset-tonal absolute inset-y-0 right-1 my-auto transform-none"
			aria-label="Show {label.toLowerCase()} options"
		>
			<IconSelector size={18} />
		</Combobox.Trigger>
	</Combobox.Control>
	<Portal>
		<Combobox.Positioner class="z-50">
			<Combobox.Content
				class="card bg-surface-50-950 border-surface-200-800 max-h-72 overflow-auto border p-2 shadow-xl"
			>
				{#each matches as option (option.value)}
					<Combobox.Item
						item={option}
						class="data-highlighted:preset-tonal flex cursor-pointer rounded-base px-3 py-2"
					>
						<Combobox.ItemText>{option.label}</Combobox.ItemText>
					</Combobox.Item>
				{:else}
					<p class="px-3 py-2 opacity-70">No results found.</p>
				{/each}
			</Combobox.Content>
		</Combobox.Positioner>
	</Portal>
</Combobox>
