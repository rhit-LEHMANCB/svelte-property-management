<script lang="ts">
	import ModalDialog from './ModalDialog.svelte';
	import { getModalStore } from './stores';

	const modalStore = getModalStore();
</script>

{#each $modalStore.slice(0, 1) as settings (settings)}
	<ModalDialog {settings} />
{/each}
