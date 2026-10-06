<script lang="ts">
	import { fly } from 'svelte/transition';
	import { getToastStore } from './stores';

	const toastStore = getToastStore();
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-4 z-[1000] flex flex-col items-center gap-2 px-4"
	aria-live="polite"
>
	{#each $toastStore as toast (toast.id)}
		<div
			role="alert"
			class="card pointer-events-auto flex w-full max-w-lg items-center gap-4 p-4 shadow-xl {toast.background ??
				'preset-filled'}"
			transition:fly={{ y: 24, duration: 150 }}
		>
			<span class="flex-auto">{toast.message}</span>
			<button
				type="button"
				class="btn-icon btn-icon-sm"
				aria-label="Dismiss"
				on:click={() => toastStore.close(toast.id)}>✕</button
			>
		</div>
	{/each}
</div>
