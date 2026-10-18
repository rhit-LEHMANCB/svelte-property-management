<script lang="ts">
	import type { Snippet } from 'svelte';
	import Breadcrumbs, { type Crumb } from './Breadcrumbs.svelte';

	let {
		title,
		breadcrumbs,
		children
	}: { title: string; breadcrumbs?: Crumb[]; children?: Snippet } = $props();
</script>

<!-- The page's one h1, with optional breadcrumbs above it and controls beside it. -->
<div class="space-y-1">
	{#if breadcrumbs?.length}<Breadcrumbs items={breadcrumbs} />{/if}
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="h3 min-w-0 truncate">{title}</h1>
		{@render children?.()}
	</div>
</div>
