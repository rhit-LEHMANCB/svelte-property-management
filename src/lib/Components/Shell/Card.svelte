<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		title,
		headingId,
		actions,
		as = 'div',
		class: className = '',
		children,
		...rest
	}: {
		/** Section heading, rendered inside the card as its first child. */
		title?: string;
		/** Id for the heading, so a list or region can be labelled by it. */
		headingId?: string;
		/** Small header controls shown beside the title. */
		actions?: Snippet;
		as?: 'div' | 'section';
		/** Layout classes only (flex, grid, gap); the padding is the card's own. */
		class?: string;
		children: Snippet;
	} & Omit<HTMLAttributes<HTMLElement>, 'class' | 'children'> = $props();
</script>

<svelte:element
	this={as}
	{...rest}
	class="card bg-surface-100-900 space-y-4 p-4 sm:p-6 {className}"
	data-card
>
	{#if title}
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 id={headingId} class="h4">{title}</h2>
			{@render actions?.()}
		</div>
	{/if}
	{@render children()}
</svelte:element>
