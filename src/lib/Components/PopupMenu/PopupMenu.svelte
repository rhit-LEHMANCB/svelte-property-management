<script lang="ts">
	import { Popover } from '@skeletonlabs/skeleton-svelte';
	import { IconDots } from '@tabler/icons-svelte';

	interface Props {
		children: import('svelte').Snippet;
	}

	let { children }: Props = $props();
	let open = $state(false);
</script>

<Popover {open} onOpenChange={(details) => (open = details.open)}>
	{#snippet trigger()}
		<button
			class="btn-icon btn-icon-sm preset-filled-primary-500"
			onclick={(event) => {
				event.stopPropagation();
				open = !open;
			}}
		>
			<IconDots />
		</button>
	{/snippet}
	{#snippet content()}
		<div class="card shadow-xl p-2">
			<div class="flex flex-col gap-2">
				{@render children()}
			</div>
		</div>
	{/snippet}
</Popover>
