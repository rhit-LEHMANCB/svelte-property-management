<script lang="ts">
	import { Avatar } from '@skeletonlabs/skeleton-svelte';

	let {
		src,
		name,
		class: className = 'size-12'
	}: { src?: string; name: string; class?: string } = $props();

	const initials = $derived(
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0])
			.join('')
			.toUpperCase()
	);
</script>

<!-- Decorative next to the visible name; falls back to initials when the photo is missing or broken. -->
<Avatar class="{className} shrink-0" aria-hidden="true">
	{#if src}<Avatar.Image {src} alt="" />{/if}
	<Avatar.Fallback class="bg-surface-300-700 font-bold">{initials}</Avatar.Fallback>
</Avatar>
