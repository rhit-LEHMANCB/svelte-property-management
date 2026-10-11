<script lang="ts">
	import type { PageData } from './$types';
	import PropertyForm from '$lib/Components/Forms/PropertyForm.svelte';
	import TenantPicker, { type PickerOption } from '$lib/Components/Forms/TenantPicker.svelte';
	import { enhance } from '$app/forms';
	import SortablePhotos from '$lib/Components/SortablePhotos.svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { refresh } from '$lib/Hooks/refresh';
	import { page } from '$app/state';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { getToastStore, getModalStore } from '$lib/ui';
	import {
		IconArrowLeft,
		IconInfoCircle,
		IconPhoto,
		IconUserDollar,
		IconLinkMinus,
		IconUsers
	} from '@tabler/icons-svelte';
	import type { DocumentWithId, PhotoItem } from '../../../../../../app';
	import UsersListView from '$lib/Components/Users/UsersListView.svelte';
	import EmptyState from '$lib/Components/DataList/EmptyState.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';

	let { data }: { data: PageData } = $props();

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	const propertyId = $derived(page.params.propertyId);

	// Reordering shows the new order at once, before the server confirms it.
	let reordered = $state<PhotoItem[] | undefined>();
	const photos = $derived(reordered ?? data.photos);
	let selectedTenant = $state<PickerOption | undefined>();
	let selectedMoveInMonth = $state('');
	let tab = $state('info');

	async function sortList(e: CustomEvent) {
		const newList = e.detail;
		reordered = newList;
		const response = await fetch(`/api/property/${propertyId}/photos`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ photos: newList })
		});
		if (response.ok) {
			await refresh();
		} else {
			errorToast('Error reordering photos.', toastStore);
		}
		reordered = undefined;
	}

	async function deleteLink(item: PhotoItem) {
		const response = await fetch(`/api/property/${propertyId}/photos`, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ photo: item })
		});

		if (response.ok) {
			successToast('Photo successfully deleted.', toastStore);
			refresh();
		} else {
			errorToast('Error deleting photo.', toastStore);
		}
	}

	function handleError(ev: Event, item: PhotoItem) {
		if (ev.target as HTMLImageElement) {
			(ev.target as HTMLImageElement).src = item.photoUrl;
		}
	}

	function confirmModal(user: DocumentWithId) {
		modalStore.trigger({
			type: 'confirm',
			title: 'Please Confirm',
			body: `Are you sure you wish to remove ${user.data.firstName} ${user.data.lastName} from this property?`,
			response: (confirmed: boolean) => {
				if (confirmed) removeJunction(user.id);
			}
		});
	}

	async function removeJunction(id: string) {
		const response = await fetch(`/api/property/${propertyId}/tenants`, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ tenantId: id })
		});
		if (response.ok) {
			successToast('User successfully removed from property.', toastStore);
			refresh();
		} else {
			errorToast('Error removing user.', toastStore);
		}
	}

	function moveInMonthOf(tenantId: string) {
		return (data.tenants as { id: string; moveInMonth?: string }[]).find((t) => t.id === tenantId)
			?.moveInMonth;
	}

	async function updateMoveInMonth(tenantId: string, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const moveInMonth = input.value;
		if (!moveInMonth) {
			// A move-in month cannot be cleared; show the stored one again.
			input.value = moveInMonthOf(tenantId) ?? '';
			errorToast('A move-in month is required.', toastStore);
			return;
		}
		const response = await fetch(`/api/property/${propertyId}/tenants`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ tenantId, moveInMonth })
		});
		if (response.ok) {
			successToast('Move-in month updated.', toastStore);
			await refresh();
		} else {
			errorToast('Error updating move-in month.', toastStore);
		}
	}

	async function addTenant() {
		if (!selectedTenant) {
			return;
		}
		const response = await fetch(`/api/property/${propertyId}/tenants`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				tenantId: selectedTenant.value,
				...(selectedMoveInMonth && { moveInMonth: selectedMoveInMonth })
			})
		});
		if (response.ok) {
			successToast('Successfully added tenant.', toastStore);
			selectedTenant = undefined;
			selectedMoveInMonth = '';
			refresh();
		} else {
			const body = await response.json().catch(() => undefined);
			errorToast(body?.message ?? 'Error adding tenant.', toastStore);
		}
	}
</script>

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title={data.form.data.title}>
		<a href="/admin/properties" class="btn btn-sm preset-tonal order-first"
			><IconArrowLeft class="size-4" aria-hidden="true" />Properties</a
		>
	</PageHeader>

	<!-- Tabs: arrow keys move between tabs; only the selected panel is rendered. -->
	<Tabs value={tab} onValueChange={(details) => (tab = details.value)}>
		<Tabs.List class="border-surface-200-800 border-b">
			<Tabs.Trigger value="info" class="btn hover:preset-tonal"
				><IconInfoCircle class="size-5" aria-hidden="true" />Info</Tabs.Trigger
			>
			<Tabs.Trigger value="photos" class="btn hover:preset-tonal"
				><IconPhoto class="size-5" aria-hidden="true" />Photos</Tabs.Trigger
			>
			<Tabs.Trigger value="tenants" class="btn hover:preset-tonal"
				><IconUserDollar class="size-5" aria-hidden="true" />Tenants</Tabs.Trigger
			>
			<Tabs.Indicator class="bg-primary-500 h-0.5" />
		</Tabs.List>
		<Tabs.Content value="info" class="pt-4">
			{#if tab === 'info'}
				<div class="card bg-surface-100-900 p-4 sm:p-6">
					<PropertyForm data={data.form} />
				</div>
			{/if}
		</Tabs.Content>
		<Tabs.Content value="photos" class="pt-4">
			{#if tab === 'photos'}
				<form
					class="card bg-surface-100-900 flex flex-col gap-4 p-4 sm:p-6"
					use:enhance
					method="POST"
					action="?/photos"
					enctype="multipart/form-data"
				>
					<h2 class="h4">Photos</h2>
					<div class="flex flex-wrap items-center gap-3">
						<label class="label min-w-0 flex-auto">
							<span class="sr-only">Photos to upload</span>
							<input
								name="photos"
								class="input"
								type="file"
								multiple
								accept="image/png, image/jpeg, image/gif, image/webp"
							/>
						</label>
						<button type="submit" class="btn preset-filled-primary-500">Add</button>
					</div>
					<SortablePhotos list={photos} on:sort={sortList} let:item let:index>
						<div class="relative">
							<div class="flex size-40 items-center justify-center overflow-hidden">
								<img
									src={item.photoUrl}
									alt="Photo {index + 1}"
									onerror={(ev) => handleError(ev, item)}
								/>
							</div>
							<button
								data-needs-hydration
								type="button"
								onclick={() => deleteLink(item)}
								aria-label="Delete photo {index + 1}"
								class="chip preset-filled-error-500 absolute -right-2 -bottom-3">Delete</button
							>
							<span class="badge-icon preset-filled absolute -top-3 -left-3" aria-hidden="true"
								>{index + 1}</span
							>
						</div>
					</SortablePhotos>
				</form>
			{/if}
		</Tabs.Content>
		<Tabs.Content value="tenants" class="space-y-4 pt-4">
			{#if tab === 'tenants'}
				<form
					class="card bg-surface-100-900 flex flex-col gap-4 p-4 sm:p-6"
					onsubmit={(event) => {
						event.preventDefault();
						addTenant();
					}}
				>
					<h2 class="h4">Tenants</h2>
					<div class="grid items-end gap-3 md:grid-cols-[1fr_auto_auto]">
						<TenantPicker
							label="Tenant"
							options={data.usersOptions}
							bind:selected={selectedTenant}
						/>
						<label class="label">
							<span class="label-text">Move-in month</span>
							<input
								class="input"
								type="month"
								name="moveInMonth"
								aria-label="Move-in month"
								bind:value={selectedMoveInMonth}
							/>
						</label>
						<button data-needs-hydration type="submit" class="btn preset-filled-primary-500"
							>Add</button
						>
					</div>
				</form>
				<section class="space-y-3">
					<h2 class="h4">Current</h2>
					<UsersListView users={data.tenants} label="tenants">
						{#snippet actions(user)}
							<input
								class="input w-44"
								type="month"
								aria-label="Move-in month for {user.data.firstName} {user.data.lastName}"
								value={moveInMonthOf(user.id) ?? ''}
								onchange={(event) => updateMoveInMonth(user.id, event)}
							/>
							<button
								data-needs-hydration
								type="button"
								onclick={() => confirmModal(user)}
								aria-label="Remove {user.data.firstName} {user.data.lastName} from this property"
								class="btn-icon btn-icon-sm preset-filled-error-500"
								><IconLinkMinus size={18} /></button
							>
						{/snippet}
						{#snippet empty()}
							<EmptyState icon={IconUsers} title="No tenants">
								Choose a tenant above to assign them to this property.
							</EmptyState>
						{/snippet}
					</UsersListView>
				</section>
			{/if}
		</Tabs.Content>
	</Tabs>
</div>
