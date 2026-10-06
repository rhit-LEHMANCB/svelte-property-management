<script lang="ts">
	/** Image URL; when missing or broken the initials are shown instead. */
	export let src: string | undefined = undefined;
	export let initials = '';
	/** Tailwind size and shape classes. */
	export let width = 'w-12';
	export let rounded = 'rounded-full';
	/** Extra classes for the wrapper. */
	let className = '';
	export { className as class };

	let failed = false;
	$: if (src) failed = false;
</script>

<figure
	class="{width} {rounded} bg-surface-300-700 inline-flex aspect-square shrink-0 overflow-hidden {className}"
>
	{#if src && !failed}
		<img {src} alt={initials} class="h-full w-full object-cover" on:error={() => (failed = true)} />
	{:else}
		<span class="flex h-full w-full items-center justify-center font-bold uppercase"
			>{initials}</span
		>
	{/if}
</figure>
