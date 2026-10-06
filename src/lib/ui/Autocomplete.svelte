<script context="module" lang="ts">
	export type AutocompleteOption = { label: string; value: unknown };
</script>

<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	/** The text typed into the search input; bound by the parent. */
	export let input = '';
	export let options: AutocompleteOption[] = [];

	const dispatch = createEventDispatcher<{ selection: AutocompleteOption }>();

	$: matches = options.filter((option) =>
		option.label.toLowerCase().includes((input ?? '').trim().toLowerCase())
	);
</script>

<nav>
	<ul class="flex flex-col p-2">
		{#each matches as option}
			<li>
				<button
					type="button"
					class="hover:preset-tonal w-full rounded-base px-4 py-2 text-left"
					on:click={() => dispatch('selection', option)}>{option.label}</button
				>
			</li>
		{:else}
			<li class="px-4 py-2 opacity-70">No results found.</li>
		{/each}
	</ul>
</nav>
