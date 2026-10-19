<script lang="ts">
	import Field from '$lib/Components/Forms/Field.svelte';

	let { errors }: { errors?: string[] } = $props();
</script>

<Field label="First Name" id="first" {errors}>
	{#snippet children({ attrs, invalid })}
		<input class="input" class:input-error={invalid} {...attrs} />
	{/snippet}
</Field>
