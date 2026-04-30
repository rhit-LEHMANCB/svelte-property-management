<script lang="ts">
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton-svelte';
	import { IconDots } from '@tabler/icons-svelte';

	export let id: string;

	const popupId = `popupMenu-${id}`;

	const popupMenu: PopupSettings = {
		event: 'focus-click',
		target: popupId,
		placement: 'top'
	};
</script>

<button
	class="btn-icon btn-icon-sm variant-filled-primary"
	on:click={(event) => event.stopPropagation()}
	use:popup={popupMenu}
>
	<IconDots />
</button>
<div class="card shadow-xl p-2" data-popup={popupId}>
	<div class="flex flex-col gap-2">
		<slot />
	</div>
	<div class="arrow bg-surface-100-800-token" />
</div>
