<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!-- The one card used by Sign in, Forgot password and Reset password. -->
<div class="card bg-surface-100-900 w-full max-w-sm p-6 shadow-xl sm:p-8" data-auth-card>
	{@render children()}
</div>
