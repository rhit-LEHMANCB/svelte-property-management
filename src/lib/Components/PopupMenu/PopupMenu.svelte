<script lang="ts">
	import { IconDots } from '@tabler/icons-svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';

	export let id: string;
</script>

<Popover>
	<Popover.Trigger class="btn-icon btn-icon-sm variant-filled-primary" on:click={(event) => event.stopPropagation()}>
		<IconDots />
	</Popover.Trigger>
	<Portal>
		<Popover.Positioner class="z-50">
			<Popover.Content class="card shadow-xl p-2 bg-surface-100-900">
				<div class="flex flex-col gap-2">
					<slot />
				</div>
				<Popover.Arrow class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-100-900)]">
					<Popover.ArrowTip />
				</Popover.Arrow>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
