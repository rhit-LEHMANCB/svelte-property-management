<script lang="ts">
	import type { PageData } from './$types';
	import { IconArrowLeft } from '@tabler/icons-svelte';
	import LeaseForm from '$lib/Components/Forms/LeaseForm.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title="New lease">
		<a href="/admin/properties/{data.property.id}/edit?tab=leases" class="btn btn-sm preset-tonal"
			><IconArrowLeft class="size-4" aria-hidden="true" />{data.property.title}</a
		>
	</PageHeader>
	<p class="opacity-80">{data.property.address}</p>
	<div class="card bg-surface-100-900 p-4 sm:p-6">
		<LeaseForm data={data.form} propertyId={data.property.id} />
	</div>
</div>
