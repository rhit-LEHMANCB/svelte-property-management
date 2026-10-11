<script lang="ts">
	import ModalDialog from './ModalDialog.svelte';
	import { getModalStore } from './stores';

	const modalStore = getModalStore();
</script>

<!-- One modal at a time; the next queued one opens when the front one closes. -->
{#each $modalStore.slice(0, 1) as settings (settings)}
	<ModalDialog {settings} />
{/each}
