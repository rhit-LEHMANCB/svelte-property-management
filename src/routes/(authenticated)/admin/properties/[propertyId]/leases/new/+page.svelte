<script lang="ts">
	import type { PageData } from './$types';
	import LeaseForm from '$lib/Components/Forms/LeaseForm.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import PageBody from '$lib/Components/Shell/PageBody.svelte';
	import Card from '$lib/Components/Shell/Card.svelte';

	let { data }: { data: PageData } = $props();
</script>

<PageBody>
	<PageHeader
		title="New lease"
		breadcrumbs={[
			{ label: 'Properties', href: '/admin/properties' },
			{ label: data.property.title, href: `/admin/properties/${data.property.id}/edit?tab=leases` },
			{ label: 'New lease' }
		]}
	/>
	<p class="opacity-80">{data.property.address}</p>
	<Card>
		<LeaseForm data={data.form} propertyId={data.property.id} lateFeeFollowsRent />
	</Card>
</PageBody>
