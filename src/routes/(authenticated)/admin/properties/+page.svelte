<script lang="ts">
	import { Avatar, Pagination } from '@skeletonlabs/skeleton-svelte';
	import { IconHomeMinus, IconHomePlus, IconPhotoCancel } from '@tabler/icons-svelte';
	import { Modal } from '@skeletonlabs/skeleton-svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { DocumentWithId } from '../../../../app';

	let confirmModalOpen = $state(false);
	let selectedProperty: DocumentWithId | null = $state(null);

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let page = $state({
		page: 0,
		limit: 5,
		size: data.properties.length,
		amounts: [1, 2, 5, 10]
	});

	let paginatedProperties = $derived(
		data.properties.slice(page.page * page.limit, page.page * page.limit + page.limit)
	);

	async function handleConfirmResponse(confirmed: boolean) {
		if (confirmed && selectedProperty) {
			await removeProperty(selectedProperty.id);
		}
		confirmModalOpen = false;
		selectedProperty = null;
	}

	function confirmModal(property: DocumentWithId) {
		selectedProperty = property;
		confirmModalOpen = true;
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

{#snippet modalContent()}
	<div class="card p-4 space-y-4 w-[400px] max-w-[90vw]">
		<header class="text-xl font-bold">Please Confirm</header>
		<p>Are you sure you wish to delete {selectedProperty?.data.title}?</p>
		<footer class="flex justify-end gap-2">
			<button
				type="button"
				class="btn preset-tonal-surface"
				onclick={() => (confirmModalOpen = false)}
			>
				Cancel
			</button>
			<button
				type="button"
				class="btn preset-filled-error-500"
				onclick={() => handleConfirmResponse(true)}
			>
				Delete
			</button>
		</footer>
	</div>
{/snippet}

<div class="grid grid-flow-row p-5 gap-5">
	<button
		onclick={addPropertyClicked}
		class="btn btn-sm preset-filled-primary-500 justify-self-start"
	>
		<IconHomePlus class="mr-2" />Add Property
	</button>
	<ul class="list">
		{#each paginatedProperties as property}
			<a href={`/admin/properties/${property.id}/edit`} class="card bg-surface-200 flex p-2">
				<li class="w-full flex items-center gap-4">
					{#if property.data.photos}
						<Avatar
							src={property.data.photos[0].photoUrl}
							name={property.data.title}
							size="size-32"
							rounded="rounded-none"
						/>
					{:else}
						<IconPhotoCancel size={128} />
					{/if}

					<strong class="h4">{`${property.data.title}`}</strong>
					<div class="flex grow justify-end">
						<button
							onclick={(event) => handleDeleteClick(event, property)}
							class="btn-icon btn-sm preset-filled-error-500"
						>
							<IconHomeMinus />
						</button>
					</div>
				</li>
			</a>
		{/each}
	</ul>
	<Pagination
		data={data.properties}
		page={page.page}
		pageSize={page.limit}
		onPageChange={(details) => (page.page = details.page)}
	/>
</div>

{#if confirmModalOpen}
	<Modal
		open={confirmModalOpen}
		onOpenChange={(details) => (confirmModalOpen = details.open)}
		content={modalContent}
	/>
{/if}
