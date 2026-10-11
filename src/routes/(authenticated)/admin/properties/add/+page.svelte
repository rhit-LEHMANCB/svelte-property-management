<script lang="ts">
	import type { PageData } from './$types';
	import PropertyForm from '$lib/Components/Forms/PropertyForm.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import { IconArrowLeft } from '@tabler/icons-svelte';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title={data.form.data.title == '' ? 'New Property' : data.form.data.title}>
		<a href="/admin/properties" class="btn btn-sm preset-tonal order-first"
			><IconArrowLeft class="size-4" aria-hidden="true" />Properties</a
		>
	</PageHeader>
	<div class="card bg-surface-100-900 p-4 sm:p-6">
		<PropertyForm data={data.form} />
	</div>
</div>
