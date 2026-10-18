<script lang="ts">
	import Notice from '$lib/Components/Shell/Notice.svelte';

	let { tone, urgent = false }: { tone: 'warning' | 'error' | 'info'; urgent?: boolean } = $props();
</script>

<Notice {tone} {urgent}><p>Message</p></Notice>
