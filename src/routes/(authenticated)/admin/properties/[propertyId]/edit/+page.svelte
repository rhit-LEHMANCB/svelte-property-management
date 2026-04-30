<script lang="ts">
	import type { PageData } from './$types';
	import PropertyForm from '$lib/Components/Forms/PropertyForm.svelte';
	import { enhance } from '$app/forms';
	import SortablePhotos from '$lib/Components/SortablePhotos.svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { page } from '$app/stores';
	import { goto, invalidateAll } from '$app/navigation';
	import {
		Tabs,
		Combobox,
		Portal,
		type ComboboxRootProps,
		useListCollection,
		type DialogSettings
	} from '@skeletonlabs/skeleton-svelte';
	import { getDialogStore } from '$lib/Hooks/dialogCompat';
	import {
		IconArrowLeft,
		IconInfoCircle,
		IconPhoto,
		IconUserDollar,
		IconLinkMinus
	} from '@tabler/icons-svelte';
	import type { DocumentWithId, PhotoItem } from '../../../../../../app';
	import UsersListView from '$lib/Components/Users/UsersListView.svelte';

	const dialogStore = getDialogStore();

	export let data: PageData;

	let photos = $state(data.photos);
	let selectedTenantId = '';
	let tabSet = $state('info');

	// Combobox setup for tenant selection
	const tenantOptions = $derived(data.usersOptions ?? []);
	let filteredTenants = $state(tenantOptions);

	const tenantCollection = $derived(
		useListCollection({
			items: filteredTenants,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value
		})
	);

	const onTenantOpenChange = () => {
		filteredTenants = tenantOptions;
	};

	const onTenantInputValueChange: ComboboxRootProps['onInputValueChange'] = (event) => {
		const filtered = tenantOptions.filter((item) =>
			item.label.toLowerCase().includes(event.inputValue.toLowerCase())
		);
		if (filtered.length > 0) {
			filteredTenants = filtered;
		} else {
			filteredTenants = tenantOptions;
		}
	};

	const onTenantValueChange: ComboboxRootProps['onValueChange'] = (event) => {
		if (event.value && event.value.length > 0) {
			selectedTenantId = event.value[0];
		}
	};

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
			errorToast('Error reordering photos.');
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
			successToast('Photo successfully deleted.');
			invalidateAll();
		} else {
			errorToast('Error deleting photo.');
		}
	}

	function handleError(ev: Event, item: PhotoItem) {
		if (ev.target as HTMLImageElement) {
			(ev.target as HTMLImageElement).src = item.photoUrl;
		}
	}

	function confirmModal(user: DocumentWithId) {
		const confirmModal: DialogSettings = {
			type: 'confirm',
			// Data
			title: 'Please Confirm',
			body: `Are you sure you wish to remove ${user.data.firstName} ${user.data.lastName} from this property?`,
			// TRUE if confirm pressed, FALSE if cancel pressed
			response: (response) => handleConfirmResponse(response, user.id)
		};
		dialogStore.trigger(confirmModal);
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
			successToast('User successfully removed from property.');
			invalidateAll();
		} else {
			errorToast('Error removing user.');
		}
	}

	async function addTenant() {
		if (!selectedTenantId) {
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
			successToast('Tenant successfully added.');
			invalidateAll();
			selectedTenantId = '';
		} else {
			errorToast('Error adding tenant.');
		}
	}
		const response = await fetch(`/api/property/${$page.params.propertyId}/tenants`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ tenantId: selectedTenantId })
		});
		if (response.ok) {
			successToast('Successfully added tenant.');
			selectedTenantId = '';
			selectedTenantName = '';
			invalidateAll();
		} else {
			errorToast('Error adding tenant.');
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
	<button on:click={() => goto('/admin/properties')} class="btn btn-sm variant-filled-primary ml-5"
		><IconArrowLeft class="mr-2" />Properties</button
	>
	<strong class="h3 mx-5 truncate">{data.form.data.title}</strong>
</div>
<hr />
<Tabs value={tabSet} onValueChange={(details) => tabSet = details.value}>
	<Tabs.List>
		<Tabs.Trigger value="info">
			<div class="flex gap-2">
				<IconInfoCircle />
				<span>Info</span>
			</div>
		</Tabs.Trigger>
		<Tabs.Trigger value="photos">
			<div class="flex gap-2">
				<IconPhoto />
				<span>Photos</span>
			</div>
		</Tabs.Trigger>
		<Tabs.Trigger value="tenants">
			<div class="flex gap-2">
				<IconUserDollar />
				<span>Tenants</span>
			</div>
		</Tabs.Trigger>
		<Tabs.Indicator />
	</Tabs.List>
	<!-- Tab Panels --->
	<Tabs.Content value="info">
		<PropertyForm data={data.form} />
	</Tabs.Content>
	<Tabs.Content value="photos">
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
	</Tabs.Content>
	<Tabs.Content value="tenants">
		<div class="flex flex-col gap-4 mx-5 mt-5">
			<strong class="h4">Add Tenant</strong>
			<div class="grid grid-cols-4 lg:grid-cols-8 gap-4">
				<div class="col-span-3">
					<Combobox
						placeholder="Search tenants..."
						collection={tenantCollection}
						onOpenChange={onTenantOpenChange}
						onInputValueChange={onTenantInputValueChange}
						onValueChange={onTenantValueChange}
					>
						<Combobox.Control>
							<Combobox.Input />
							<Combobox.Trigger />
						</Combobox.Control>
						<Portal>
							<Combobox.Positioner>
								<Combobox.Content class="z-50">
									{#each filteredTenants as item (item.value)}
										<Combobox.Item item={item}>
											<Combobox.ItemText>{item.label}</Combobox.ItemText>
											<Combobox.ItemIndicator />
										</Combobox.Item>
									{/each}
								</Combobox.Content>
							</Combobox.Positioner>
						</Portal>
					</Combobox>
				</div>
				<div class="justify-self-start">
					<button on:click={addTenant} class="btn variant-filled-secondary">Add</button>
				</div>
			</div>
		</div>
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
	</Tabs.Content>
</Tabs>
