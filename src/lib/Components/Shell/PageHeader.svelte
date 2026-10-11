<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<!-- The page's one h1, with optional controls (for example a back link) beside it. -->
<div class="flex flex-wrap items-center justify-between gap-3">
	<h1 class="h3 min-w-0 truncate">{title}</h1>
	{@render children?.()}
</div>
