<script lang="ts" module>
	import type { IconDots as Icon } from '@tabler/icons-svelte';

	export type RowAction = {
		label: string;
		icon?: typeof Icon;
		/** Shown in the error color, for destructive actions. */
		danger?: boolean;
		run: () => void;
	};
</script>

<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { IconDots } from '@tabler/icons-svelte';

	/** `label` names the menu button, for example "Actions for Ada Admin". */
	let { label, actions }: { label: string; actions: RowAction[] } = $props();
</script>

<!-- Menu: Enter or Space opens it, arrow keys move, Escape closes and focus returns to the button. -->
<Menu onSelect={(details) => actions.find((action) => action.label === details.value)?.run()}>
	<Menu.Trigger data-needs-hydration class="btn-icon btn-icon-sm preset-tonal" aria-label={label}>
		<IconDots size={18} />
	</Menu.Trigger>
	<Portal>
		<Menu.Positioner class="z-50">
			<Menu.Content
				class="card bg-surface-50-950 border-surface-200-800 flex min-w-40 flex-col gap-1 border p-2 shadow-xl"
			>
				{#each actions as action (action.label)}
					<Menu.Item
						value={action.label}
						class="flex cursor-pointer items-center gap-2 rounded-base px-3 py-2 data-highlighted:preset-tonal {action.danger
							? 'text-error-700-300'
							: ''}"
					>
						{#if action.icon}<action.icon size={18} aria-hidden="true" />{/if}
						<Menu.ItemText>{action.label}</Menu.ItemText>
					</Menu.Item>
				{/each}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
