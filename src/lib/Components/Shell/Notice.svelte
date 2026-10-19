<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		tone,
		urgent = false,
		class: className = '',
		children
	}: {
		tone: 'warning' | 'error' | 'info';
		/** Announce at once, for a warning that stopped what the user was doing. */
		urgent?: boolean;
		/** Layout classes only; the padding is the notice's own. */
		class?: string;
		children: Snippet;
	} = $props();

	const preset = {
		warning: 'preset-tonal-warning',
		error: 'preset-tonal-error',
		info: 'preset-tonal-primary'
	};
</script>

<!-- Errors interrupt (alert); warnings and information wait their turn (status) unless urgent. -->
<div
	class="card {preset[tone]} space-y-2 p-4 {className}"
	role={tone === 'error' || urgent ? 'alert' : 'status'}
	data-notice={tone}
>
	{@render children()}
</div>
