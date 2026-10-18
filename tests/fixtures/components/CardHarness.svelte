<script lang="ts">
	import Card from '$lib/Components/Shell/Card.svelte';

	let { title }: { title?: string } = $props();
</script>

<Card {title}><p>Body</p></Card>
