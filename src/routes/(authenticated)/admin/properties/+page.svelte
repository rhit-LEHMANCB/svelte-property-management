<script lang="ts" module>
	import { IconHomeMinus, IconHomePlus, IconPhotoCancel } from '@tabler/icons-svelte';
	import { getDialogStore, type DialogSettings } from '$lib/Hooks/dialogCompat';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { DocumentWithId } from '../../../../app';
	import { Avatar, Pagination } from '@skeletonlabs/skeleton-svelte';
</script>

<script lang="ts">
	const dialogStore = getDialogStore();

	let { data } = $props<{ data: PageData }>();

	let page = $state({
		page: 1,
		limit: 5,
		size: 0,
		amounts: [1, 2, 5, 10]
	});

	let paginatedProperties = $derived(
		data.properties.slice(
			(page.page - 1) * page.limit, // start
			(page.page - 1) * page.limit + page.limit // end
		)
	);

	async function handleConfirmResponse(confirmed: boolean, userId: string) {
		if (confirmed) {
			await removeProperty(userId);
		}
	}

	function confirmModal(property: DocumentWithId) {
		const confirmModal: DialogSettings = {
			type: 'confirm',
			// Data
			title: 'Please Confirm',
			body: `Are you sure you wish to delete ${property.data.title}?`,
			// TRUE if confirm pressed, FALSE if cancel pressed
			response: (response: string | boolean) =>
				handleConfirmResponse(response as boolean, property.id)
		};
		dialogStore.trigger(confirmModal);
	}

	function addPropertyClicked() {
		goto('/admin/properties/add');
	}

	async function removeProperty(id: string) {
		const response = await fetch(`/api/property/${id}`, {
			method: 'DELETE'
		});
		if (response.ok) {
			successToast('Property Successfully Removed.');
			invalidateAll();
		} else {
			errorToast('Error removing property.');
		}
	}

	function handleDeleteClick(event: Event, property: DocumentWithId) {
		event.preventDefault();
		confirmModal(property);
	}
</script>

<div class="grid grid-flow-row p-5 gap-5">
	<button onclick={addPropertyClicked} class="btn btn-sm variant-filled-primary justify-self-start"
		><IconHomePlus class="mr-2" />Add Property</button
	>
	<ul class="list">
		{#each paginatedProperties as property}
			<a href={`/admin/properties/${property.id}/edit`} class="card bg-surface-200 flex p-2">
				<li class="w-full">
					{#if property.data.photos}
						<Avatar class="rounded-none w-32">
							<Avatar.Image src={property.data.photos[0].photoUrl} alt={property.data.title} />
							<Avatar.Fallback>{property.data.title.charAt(0)}</Avatar.Fallback>
						</Avatar>
					{:else}
						<IconPhotoCancel size={128} />
					{/if}

					<strong class="h4">{`${property.data.title}`}</strong>
					<div class="flex grow justify-end">
						<button
							onclick={(event) => handleDeleteClick(event, property)}
							class="btn-icon btn-sm variant-filled-error"><IconHomeMinus /></button
						>
					</div>
				</li>
			</a>
		{/each}
	</ul>
	<Pagination
		count={data.properties.length}
		pageSize={page.limit}
		page={page.page}
		onPageChange={(event) => (page.page = event.page)}
	>
		<Pagination.PrevTrigger />
		<Pagination.Context>
			{#snippet children(pagination)}
				{#each pagination().pages as p, index (p)}
					{#if p.type === 'page'}
						<Pagination.Item {...p}>
							{p.value}
						</Pagination.Item>
					{:else}
						<Pagination.Ellipsis {index}>&#8230;</Pagination.Ellipsis>
					{/if}
				{/each}
			{/snippet}
		</Pagination.Context>
		<Pagination.NextTrigger />
	</Pagination>
</div>
