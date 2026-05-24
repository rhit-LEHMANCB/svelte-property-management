<script lang="ts">
	import type { PageData } from './$types';
	import PropertyForm from '$lib/Components/Forms/PropertyForm.svelte';
	import { goto } from '$app/navigation';
	import { IconArrowLeft } from '@tabler/icons-svelte';

	export let data: PageData;
</script>

<div class="pt-5">
	<div class="flex flex-row justify-between mb-4">
		<button
			on:click={() => goto('/admin/properties')}
			class="btn btn-sm preset-filled-primary-500 ml-5"
			><IconArrowLeft class="mr-2" />Properties</button
		>
		<strong class="h3 mx-5 truncate"
			>{data.form.data.title == '' ? 'New Property' : data.form.data.title}</strong
		>
	</div>
	<hr />
	<div class="pt-5">
		<PropertyForm data={data.form} />
	</div>
</div>
