<script lang="ts">
	import type { PageData } from './$types';
	import PropertyForm from '$lib/Components/Forms/PropertyForm.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import PageBody from '$lib/Components/Shell/PageBody.svelte';
	import Card from '$lib/Components/Shell/Card.svelte';

	let { data }: { data: PageData } = $props();
</script>

<PageBody>
	<PageHeader
		title={data.form.data.title == '' ? 'New Property' : data.form.data.title}
		breadcrumbs={[{ label: 'Properties', href: '/admin/properties' }, { label: 'New property' }]}
	/>
	<Card>
		<PropertyForm data={data.form} />
	</Card>
</PageBody>
