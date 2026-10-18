<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!-- The row of buttons that ends every form. -->
<div class="flex flex-wrap items-center gap-2 pt-2" data-form-actions>
	{@render children()}
</div>
