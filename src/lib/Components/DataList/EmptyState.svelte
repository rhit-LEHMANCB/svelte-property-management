<script lang="ts">
	import type { IconDots } from '@tabler/icons-svelte';
	import type { Snippet } from 'svelte';

	let {
		icon: Icon,
		title,
		children,
		action
	}: { icon: typeof IconDots; title: string; children?: Snippet; action?: Snippet } = $props();
</script>

<div
	class="card bg-surface-100-900 border-surface-200-800 flex flex-col items-center gap-3 border border-dashed p-8 text-center"
>
	<Icon size={40} class="opacity-60" aria-hidden="true" />
	<p class="h5">{title}</p>
	{#if children}<p class="max-w-prose opacity-80">{@render children()}</p>{/if}
	{@render action?.()}
</div>
