<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!-- Every signed-in page's content: centered, at most 1024px wide, with the shared side padding. -->
<div class="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6" data-page-body>
	{@render children()}
</div>
