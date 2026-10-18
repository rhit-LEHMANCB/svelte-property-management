<script lang="ts" module>
	/** One step of the trail; the last one is the current page and is not linked. */
	export type Crumb = { label: string; href?: string };
</script>

<script lang="ts">
	import { IconChevronRight } from '@tabler/icons-svelte';

	let { items }: { items: Crumb[] } = $props();
</script>

<nav aria-label="Breadcrumb" class="min-w-0">
	<ol class="flex flex-wrap items-center gap-1 text-sm">
		{#each items as item, index (index)}
			<li class="flex min-w-0 items-center gap-1">
				{#if index > 0}<IconChevronRight
						class="size-4 shrink-0 opacity-60"
						aria-hidden="true"
					/>{/if}
				{#if index < items.length - 1 && item.href}
					<a class="anchor block max-w-[16rem] truncate" href={item.href} title={item.label}
						>{item.label}</a
					>
				{:else}
					<span class="block max-w-[16rem] truncate" aria-current="page" title={item.label}
						>{item.label}</span
					>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
