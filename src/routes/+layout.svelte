<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';

	import { ModalHost, ToastHost, initializeStores } from '$lib/ui';

	initializeStores();

	// Tells the CSS in app.css that the page is interactive; until then marked buttons show a spinner.
	onMount(() => {
		document.documentElement.dataset.hydrated = '';
	});
</script>

<ToastHost />

<ModalHost />

<slot />
