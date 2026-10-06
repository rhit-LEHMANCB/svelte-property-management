<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { getDrawerStore } from './stores';

	const drawerStore = getDrawerStore();

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && $drawerStore) drawerStore.close();
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if $drawerStore}
	<div class="fixed inset-0 z-40">
		<button
			type="button"
			aria-label="Close menu"
			class="absolute inset-0 cursor-default bg-black/50"
			transition:fade={{ duration: 150 }}
			on:click={() => drawerStore.close()}
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Navigation"
			class="bg-surface-100-900 absolute inset-y-0 left-0 w-[80vw] overflow-y-auto shadow-xl md:w-[280px]"
			transition:fly={{ x: -280, duration: 150 }}
		>
			<slot />
		</div>
	</div>
{/if}
