<script lang="ts">
	import Notice from '$lib/Components/Shell/Notice.svelte';

	let { tone }: { tone: 'warning' | 'error' | 'info' } = $props();
</script>

<Notice {tone}><p>Message</p></Notice>
