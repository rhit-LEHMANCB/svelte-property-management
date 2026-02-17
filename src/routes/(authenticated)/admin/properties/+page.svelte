<script lang="ts">
	import { Avatar, Paginator, getToastStore } from '@skeletonlabs/skeleton';
	import { IconHomeMinus, IconHomePlus, IconPhotoCancel } from '@tabler/icons-svelte';
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { DocumentWithId } from '../../../../../app';

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	export let data: PageData;

	let page = {
		page: 0,
		limit: 5,
		size: data.properties.length,
		amounts: [1, 2, 5, 10]
	};

	$: paginatedProperties = data.properties.slice(
		page.page * page.limit, // start
		page.page * page.limit + page.limit // end
	);

	async function handleConfirmResponse(confirmed: boolean, userId: string) {
		if (confirmed) {
			await removeProperty(userId);
		}
	}

	function confirmModal(property: DocumentWithId) {
		const confirmModal: ModalSettings = {
			type: 'confirm',
			// Data
			title: 'Please Confirm',
			body: `Are you sure you wish to delete ${property.data.title}?`,
			// TRUE if confirm pressed, FALSE if cancel pressed
			response: (response) => handleConfirmResponse(response, property.id)
		};
		modalStore.trigger(confirmModal);
	}

	function addPropertyClicked() {
		goto('/admin/properties/add');
	}

	async function removeProperty(id: string) {
		const response = await fetch(`/api/property/${id}`, {
			method: 'DELETE'
		});
		if (response.ok) {
			successToast('Property Successfully Removed.', toastStore);
			invalidateAll();
		} else {
			errorToast('Error removing property.', toastStore);
		}
	}

	function handleDeleteClick(event: Event, property: DocumentWithId) {
		event.preventDefault();
		confirmModal(property);
	}
</script>

<div class="grid grid-flow-row p-5 gap-5">
	<button on:click={addPropertyClicked} class="btn btn-sm variant-filled-primary justify-self-start"
		><IconHomePlus class="mr-2" />Add Property</button
	>
	<ul class="list">
		{#each paginatedProperties as property}
			<a
				href={`/admin/properties/${property.id}/edit`}
				class="card bg-surface-200 flex p-2"
			>
				<li class="w-full">
					{#if property.data.photos}
						<Avatar src={property.data.photos[0].photoUrl} rounded="rounded-none" width="w-32" />
					{:else}
						<IconPhotoCancel size={128} />
					{/if}

					<strong class="h4">{`${property.data.title}`}</strong>
					<div class="flex grow justify-end">
						<button
							on:click={(event) => handleDeleteClick(event, property)}
							class="btn-icon btn-sm variant-filled-error"><IconHomeMinus /></button
						>
					</div>
				</li>
			</a>
		{/each}
	</ul>
	<Paginator bind:settings={page} showFirstLastButtons={false} showPreviousNextButtons={true} />
</div>
