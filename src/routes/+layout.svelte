<script lang="ts">
	import '../app.css';

	import { ModalHost, ToastHost, initializeStores } from '$lib/ui';

	initializeStores();
</script>

<ToastHost />

<ModalHost />

<slot />
