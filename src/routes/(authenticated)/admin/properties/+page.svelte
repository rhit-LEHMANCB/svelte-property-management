<script lang="ts">
	import { getModalStore, getToastStore } from '$lib/ui';
	import {
		IconBuildingEstate,
		IconEdit,
		IconHomeMinus,
		IconHomePlus,
		IconPhotoCancel
	} from '@tabler/icons-svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { refresh } from '$lib/Hooks/refresh';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { DocumentWithId } from '../../../../app';
	import DataList, { type DataColumn } from '$lib/Components/DataList/DataList.svelte';
	import RowMenu from '$lib/Components/DataList/RowMenu.svelte';
	import EmptyState from '$lib/Components/DataList/EmptyState.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import PageBody from '$lib/Components/Shell/PageBody.svelte';
	import Card from '$lib/Components/Shell/Card.svelte';

	let { data }: { data: PageData } = $props();

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	const address = (property: DocumentWithId) =>
		[property.data.streetAddress, property.data.city, property.data.state]
			.filter(Boolean)
			.join(', ');

	const columns: DataColumn<DocumentWithId>[] = [
		{ id: 'title', label: 'Property', sort: (property) => property.data.title },
		{ id: 'address', label: 'Address', sort: address },
		{ id: 'rent', label: 'Rent', sort: (property) => Number(property.data.rent) || undefined },
		{ id: 'actions', label: 'Actions', srOnly: true, class: 'text-right' }
	];

	const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	function confirmModal(property: DocumentWithId) {
		modalStore.trigger({
			type: 'confirm',
			title: 'Please Confirm',
			body: `Are you sure you wish to delete ${property.data.title}?`,
			response: (confirmed: boolean) => {
				if (confirmed) removeProperty(property.id);
			}
		});
	}

	async function removeProperty(id: string) {
		const response = await fetch(`/api/property/${id}`, {
			method: 'DELETE'
		});
		if (response.ok) {
			successToast('Property Successfully Removed.', toastStore);
			refresh();
		} else {
			errorToast('Error removing property.', toastStore);
		}
	}
</script>

{#snippet addButton()}
	<a href="/admin/properties/add" class="btn preset-filled-primary-500"
		><IconHomePlus class="size-5" aria-hidden="true" />Add Property</a
	>
{/snippet}

<PageBody>
	<PageHeader title="Properties" subtitle="Homes you rent out, with their leases and photos.">
		{#if data.properties.length > 0}{@render addButton()}{/if}
	</PageHeader>
	<Card>
		<DataList
			label="properties"
			items={data.properties}
			key={(property) => property.id}
			{columns}
			sortBy="title"
			searchText={(property) => `${property.data.title ?? ''} ${address(property)}`}
		>
			{#snippet cell(property, column)}
				{#if column.id === 'title'}
					<a
						href={`/admin/properties/${property.id}/edit`}
						class="flex items-center gap-3 font-bold hover:underline"
					>
						{#if property.data.photos?.length}
							<img
								src={property.data.photos[0].photoUrl}
								alt=""
								class="rounded-base size-16 shrink-0 object-cover"
							/>
						{:else}
							<span
								class="rounded-base bg-surface-200-800 flex size-16 shrink-0 items-center justify-center"
							>
								<IconPhotoCancel size={28} aria-hidden="true" />
							</span>
						{/if}
						<span>{property.data.title}</span>
					</a>
				{:else if column.id === 'address'}
					{address(property)}
				{:else if column.id === 'rent'}
					{Number.isFinite(Number(property.data.rent))
						? currency.format(Number(property.data.rent))
						: ''}
				{:else if column.id === 'actions'}
					<div class="flex justify-end">
						<RowMenu
							label="Actions for {property.data.title}"
							actions={[
								{
									label: 'Edit',
									icon: IconEdit,
									run: () => goto(`/admin/properties/${property.id}/edit`)
								},
								{
									label: 'Delete',
									icon: IconHomeMinus,
									danger: true,
									run: () => confirmModal(property)
								}
							]}
						/>
					</div>
				{/if}
			{/snippet}
			{#snippet empty()}
				<EmptyState icon={IconBuildingEstate} title="No properties yet">
					Add your first property to assign tenants and take rent payments.
					{#snippet action()}{@render addButton()}{/snippet}
				</EmptyState>
			{/snippet}
		</DataList>
	</Card>
</PageBody>
