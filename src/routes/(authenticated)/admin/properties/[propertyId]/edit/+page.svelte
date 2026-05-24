<script lang="ts">
	import type { PageData } from './$types';
	import PropertyForm from '$lib/Components/Forms/PropertyForm.svelte';
	import { enhance } from '$app/forms';
	import SortablePhotos from '$lib/Components/SortablePhotos.svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { page } from '$app/stores';
	import { goto, invalidateAll } from '$app/navigation';
	import { Combobox, Tabs, Modal } from '@skeletonlabs/skeleton-svelte';
	import {
		IconArrowLeft,
		IconInfoCircle,
		IconPhoto,
		IconUserDollar,
		IconLinkMinus
	} from '@tabler/icons-svelte';
	import type { DocumentWithId, PhotoItem } from '../../../../../../app';
	import UsersListView from '$lib/Components/Users/UsersListView.svelte';
	import { get } from 'svelte/store';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let photos = $state(data.photos);
	let selectedTenantId = $state<string[]>([]);
	let tabSet = $state('info');
	let confirmModalOpen = $state(false);
	let selectedUser: DocumentWithId | null = $state(null);

	// Update photos when data changes
	$effect(() => {
		photos = data.photos;
	});

	async function sortList(e: CustomEvent) {
		const newList = e.detail;
		photos = newList;
		const currentPage = get(page);
		const response = await fetch(`/api/property/${currentPage.params.propertyId}/photos`, {
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
		const currentPage = get(page);
		const response = await fetch(`/api/property/${currentPage.params.propertyId}/photos`, {
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

	function onTenantSelect(details: { value: string[] }) {
		selectedTenantId = details.value;
	}

	function confirmModal(user: DocumentWithId) {
		selectedUser = user;
		confirmModalOpen = true;
	}

	async function handleConfirmResponse(confirmed: boolean) {
		if (confirmed && selectedUser) {
			await removeJunction(selectedUser.id);
		}
		confirmModalOpen = false;
		selectedUser = null;
	}

	async function removeJunction(id: string) {
		const currentPage = get(page);
		const response = await fetch(`/api/property/${currentPage.params.propertyId}/tenants`, {
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
		if (!selectedTenantId || selectedTenantId.length === 0) {
			return;
		}
		const currentPage = get(page);
		const response = await fetch(`/api/property/${currentPage.params.propertyId}/tenants`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ tenantId: selectedTenantId[0] })
		});
		if (response.ok) {
			successToast('Successfully added tenant.');
			selectedTenantId = [];
			invalidateAll();
		} else {
			errorToast('Error adding tenant.');
		}
	}
</script>

{#snippet actionButton(user: DocumentWithId)}
	<button onclick={() => confirmModal(user)} class="btn-icon btn-sm preset-filled-error-500">
		<IconLinkMinus />
	</button>
{/snippet}

{#snippet confirmModalContent()}
	<div class="card p-4 space-y-4 w-[400px] max-w-[90vw]">
		<header class="text-xl font-bold">Please Confirm</header>
		<p>
			Are you sure you wish to remove {selectedUser?.data.firstName}
			{selectedUser?.data.lastName} from this property?
		</p>
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
				Remove
			</button>
		</footer>
	</div>
{/snippet}

<div class="flex flex-row justify-between py-5">
	<button
		onclick={() => goto('/admin/properties')}
		class="btn btn-sm preset-filled-primary-500 ml-5"
	>
		<IconArrowLeft class="mr-2" />Properties
	</button>
	<strong class="h3 mx-5 truncate">{data.form.data.title}</strong>
</div>
<hr />
<Tabs value={tabSet} onValueChange={(details) => (tabSet = details.value)}>
	{#snippet list()}
		<Tabs.Control value="info">
			<div class="flex gap-2 items-center">
				<IconInfoCircle />
				<span>Info</span>
			</div>
		</Tabs.Control>
		<Tabs.Control value="photos">
			<div class="flex gap-2 items-center">
				<IconPhoto />
				<span>Photos</span>
			</div>
		</Tabs.Control>
		<Tabs.Control value="tenants">
			<div class="flex gap-2 items-center">
				<IconUserDollar />
				<span>Tenants</span>
			</div>
		</Tabs.Control>
	{/snippet}
	{#snippet content()}
		<div class="py-4">
			{#if tabSet === 'info'}
				<PropertyForm data={data.form} />
			{:else if tabSet === 'photos'}
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
							<button type="submit" class="btn preset-filled-secondary-500">Add</button>
						</div>
					</div>
					<SortablePhotos list={photos} on:sort={sortList} let:item let:index>
						<div class="group relative">
							<div class="w-40 h-40 overflow-hidden flex items-center justify-center">
								<img src={item.photoUrl} alt={item.id} onerror={(ev) => handleError(ev, item)} />
							</div>
							<button
								onclick={() => deleteLink(item)}
								class="chip preset-filled-error-500 invisible group-hover:visible transition-all absolute -right-2 -bottom-4"
							>
								Delete
							</button>
							<span class="badge-icon preset-filled-primary-500 absolute -left-3 -top-3"
								>{index + 1}</span
							>
						</div>
					</SortablePhotos>
				</form>
			{:else if tabSet === 'tenants'}
				<form class="flex flex-col gap-4 mx-5 mt-5">
					<strong class="h4">Tenants</strong>
					<div class="grid grid-cols-4 lg:grid-cols-8 gap-4">
						<div class="col-span-3">
							<Combobox
								data={data.usersOptions}
								value={selectedTenantId}
								onValueChange={onTenantSelect}
								placeholder="Search tenants..."
							/>
						</div>
						<div class="justify-self-start">
							<button onclick={addTenant} class="btn preset-filled-secondary-500">Add</button>
						</div>
					</div>
				</form>
				<div class="p-5">
					<strong class="h4">Current</strong>
					{#if data.tenants.length > 0}
						<UsersListView users={data.tenants} class="pt-2" {actionButton} />
					{:else}
						<div>No tenants</div>
					{/if}
				</div>
			{/if}
		</div>
	{/snippet}
</Tabs>

{#if confirmModalOpen}
	<Modal
		open={confirmModalOpen}
		onOpenChange={(details) => (confirmModalOpen = details.open)}
		content={confirmModalContent}
	/>
{/if}
