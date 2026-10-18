<script lang="ts">
	import type { Snippet } from 'svelte';
	import Breadcrumbs, { type Crumb } from './Breadcrumbs.svelte';

	let {
		title,
		subtitle,
		breadcrumbs,
		children
	}: {
		title: string;
		/** One short line under the title: an address or what the page is for. */
		subtitle?: string;
		breadcrumbs?: Crumb[];
		children?: Snippet;
	} = $props();
</script>

<!-- The page's one h1, with optional breadcrumbs above it, a subtitle under it and controls beside it. -->
<div class="space-y-1" data-page-header>
	{#if breadcrumbs?.length}<Breadcrumbs items={breadcrumbs} />{/if}
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="h3 min-w-0 truncate">{title}</h1>
		{@render children?.()}
	</div>
	{#if subtitle}<p class="opacity-80">{subtitle}</p>{/if}
</div>
