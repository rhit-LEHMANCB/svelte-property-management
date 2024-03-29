<script lang="ts">
	import type { PageData } from './$types';
	import PropertyForm from '$lib/Components/Forms/PropertyForm.svelte';
	import { enhance } from '$app/forms';
	import SortablePhotos from '$lib/Components/SortablePhotos.svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { page } from '$app/stores';
	import { goto, invalidateAll } from '$app/navigation';
	import {
		Autocomplete,
		popup,
		type AutocompleteOption,
		type PopupSettings,
		Tab,
		TabGroup,
		getToastStore,
		type ModalSettings,
		getModalStore
	} from '@skeletonlabs/skeleton';
	import {
		IconArrowLeft,
		IconInfoCircle,
		IconPhoto,
		IconUserDollar,
		IconLinkMinus
	} from '@tabler/icons-svelte';
	import type { DocumentWithId, PhotoItem } from '../../../../../../../app';
	import UsersListView from '$lib/Components/Users/UsersListView.svelte';

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	export let data: PageData;

	$: photos = data.photos;
	let selectedTenantName = '';
	let selectedTenantId = '';

	async function sortList(e: CustomEvent) {
		const newList = e.detail;
		photos = newList;
		const response = await fetch(`/api/property/${$page.params.propertyId}/photos`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ photos: newList })
		});
		if (response.ok) {
			invalidateAll();
		} else {
			errorToast('Error reordering photos.', toastStore);
		}
	}

	async function deleteLink(item: PhotoItem) {
		const response = await fetch(`/api/property/${$page.params.propertyId}/photos`, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ photo: item })
		});

		if (response.ok) {
			successToast('Photo successfully deleted.', toastStore);
			invalidateAll();
		} else {
			errorToast('Error deleting photo.', toastStore);
		}
	}

	function handleError(ev: Event, item: PhotoItem) {
		if (ev.target as HTMLImageElement) {
			(ev.target as HTMLImageElement).src = item.photoUrl;
		}
	}

	function onTenantSelect(event: CustomEvent<AutocompleteOption>): void {
		selectedTenantName = event.detail.label;
		selectedTenantId = event.detail.value as string;
	}

	function confirmModal(user: DocumentWithId) {
		const confirmModal: ModalSettings = {
			type: 'confirm',
			// Data
			title: 'Please Confirm',
			body: `Are you sure you wish to remove ${user.data.firstName} ${user.data.lastName} from this property?`,
			// TRUE if confirm pressed, FALSE if cancel pressed
			response: (response) => handleConfirmResponse(response, user.id)
		};
		modalStore.trigger(confirmModal);
	}

	async function handleConfirmResponse(confirmed: boolean, userId: string) {
		if (confirmed) {
			await removeJunction(userId);
		}
	}

	async function removeJunction(id: string) {
		const response = await fetch(`/api/property/${$page.params.propertyId}/tenants`, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ tenantId: id })
		});
		if (response.ok) {
			successToast('User successfully removed from property.', toastStore);
			invalidateAll();
		} else {
			errorToast('Error removing user.', toastStore);
		}
	}

	async function addTenant() {
		if (!selectedTenantName || !selectedTenantId) {
			return;
		}
		const response = await fetch(`/api/property/${$page.params.propertyId}/tenants`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ tenantId: selectedTenantId })
		});
		if (response.ok) {
			successToast('Successfully added tenant.', toastStore);
			selectedTenantId = '';
			selectedTenantName = '';
			invalidateAll();
		} else {
			errorToast('Error adding tenant.', toastStore);
		}
	}

	let popupSettings: PopupSettings = {
		event: 'focus-click',
		target: 'popupAutocomplete',
		placement: 'bottom'
	};

	let tabSet = 0;
</script>

<div class="flex flex-row justify-between py-5">
	<button
		on:click={() => goto('/manager/admin/properties')}
		class="btn btn-sm variant-filled-primary ml-5"><IconArrowLeft class="mr-2" />Properties</button
	>
	<strong class="h3 mx-5 truncate">{data.form.data.title}</strong>
</div>
<hr />
<TabGroup>
	<Tab bind:group={tabSet} name="info" value={0}>
		<div class="flex gap-2">
			<IconInfoCircle />
			<span>Info</span>
		</div>
	</Tab>
	<Tab bind:group={tabSet} name="photos" value={1}
		><div class="flex gap-2">
			<IconPhoto />
			<span>Photos</span>
		</div></Tab
	>
	<Tab bind:group={tabSet} name="tenants" value={2}
		><div class="flex gap-2">
			<IconUserDollar />
			<span>Tenants</span>
		</div></Tab
	>
	<!-- Tab Panels --->
	<svelte:fragment slot="panel">
		{#if tabSet === 0}
			<PropertyForm data={data.form} />
		{:else if tabSet === 1}
			<form
				class="flex flex-col gap-4 m-5 pb-5"
				use:enhance
				method="POST"
				action="?/photos"
				enctype="multipart/form-data"
			>
				<strong class="h4">Photos</strong>
				<div class="grid grid-cols-4 lg:grid-cols-8 gap-4">
					<input
						name="photos"
						class="input col-span-3"
						type="file"
						multiple
						accept="image/png, image/jpeg, image/gif, image/webp"
					/>
					<div>
						<button type="submit" class="btn variant-filled-secondary">Add</button>
					</div>
				</div>
				<SortablePhotos list={photos} on:sort={sortList} let:item let:index>
					<div class="group relative">
						<div class="w-40 h-40 overflow-hidden flex items-center justify-center">
							<img src={item.photoUrl} alt={item.id} on:error={(ev) => handleError(ev, item)} />
						</div>
						<button
							on:click={() => deleteLink(item)}
							class="chip variant-filled-error invisible group-hover:visible transition-all absolute -right-2 -bottom-4"
							>Delete</button
						>
						<span class="badge-icon variant-filled absolute -left-3 -top-3">{index + 1}</span>
					</div>
				</SortablePhotos>
			</form>
		{:else if tabSet === 2}
			<form class="flex flex-col gap-4 mx-5 mt-5">
				<strong class="h4">Tenants</strong>
				<div class="grid grid-cols-4 lg:grid-cols-8 gap-4">
					<input
						class="input autocomplete col-span-3"
						type="search"
						name="tenants"
						bind:value={selectedTenantName}
						placeholder="Search..."
						use:popup={popupSettings}
					/>
					<div class="justify-self-start">
						<button on:click={addTenant} class="btn variant-filled-secondary">Add</button>
					</div>
				</div>
				<div class="card w-full max-w-sm shadow-xl" data-popup="popupAutocomplete">
					<div class="max-h-96 overflow-auto">
						<Autocomplete
							bind:input={selectedTenantName}
							options={data.usersOptions}
							on:selection={onTenantSelect}
						/>
					</div>
					<div class="arrow bg-surface-100-800-token" />
				</div>
			</form>
			<div class="p-5">
				<strong class="h4">Current</strong>
				{#if data.tenants.length > 0}
					<UsersListView users={data.tenants} class="pt-2">
						<svelte:fragment slot="actionButton" let:user>
							<button
								on:click={() => confirmModal(user)}
								class="btn-icon btn-sm variant-filled-error"><IconLinkMinus /></button
							>
						</svelte:fragment>
					</UsersListView>
				{:else}
					<div>No tenants</div>
				{/if}
			</div>
		{/if}
	</svelte:fragment>
</TabGroup>
