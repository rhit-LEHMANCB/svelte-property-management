<script lang="ts">
	import type { PageData } from './$types';
	import PropertyForm from '$lib/Components/Forms/PropertyForm.svelte';
	import { enhance } from '$app/forms';
	import SortablePhotos from '$lib/Components/SortablePhotos.svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { refresh } from '$lib/Hooks/refresh';
	import { page } from '$app/state';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { getToastStore } from '$lib/ui';
	import {
		IconArrowLeft,
		IconFileText,
		IconInfoCircle,
		IconPhoto,
		IconPlus
	} from '@tabler/icons-svelte';
	import type { PhotoItem } from '../../../../../../app';
	import EmptyState from '$lib/Components/DataList/EmptyState.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import LeaseBilling from '$lib/Components/Leases/LeaseBilling.svelte';

	let { data }: { data: PageData } = $props();

	const toastStore = getToastStore();

	const propertyId = $derived(page.params.propertyId);

	// Reordering shows the new order at once, before the server confirms it.
	let reordered = $state<PhotoItem[] | undefined>();
	const photos = $derived(reordered ?? data.photos);
	// `?tab=leases` opens the Leases tab, for links back from the lease pages.
	let tab = $state(page.url.searchParams.get('tab') === 'leases' ? 'leases' : 'info');

	const statusClass = {
		current: 'preset-filled-success-500',
		upcoming: 'preset-filled-primary-500',
		ended: 'preset-tonal'
	} as const;
	const money = (amount: number) =>
		amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

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
			<Tabs.Trigger value="leases" class="btn hover:preset-tonal"
				><IconFileText class="size-5" aria-hidden="true" />Leases</Tabs.Trigger
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
		<Tabs.Content value="leases" class="space-y-4 pt-4">
			{#if tab === 'leases'}
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h2 class="h4">Leases</h2>
					<a href="/admin/properties/{propertyId}/leases/new" class="btn preset-filled-primary-500"
						><IconPlus class="size-4" aria-hidden="true" />New lease</a
					>
				</div>
				{#if data.leases.length === 0}
					<EmptyState icon={IconFileText} title="No leases">
						Create a lease to add tenants to this property.
					</EmptyState>
				{:else}
					<ul class="space-y-3" aria-label="Leases">
						{#each data.leases as lease (lease.id)}
							<li class="card bg-surface-100-900 flex flex-wrap items-start gap-4 p-4">
								<div class="min-w-0 flex-auto space-y-1">
									<div class="flex flex-wrap items-center gap-2">
										<span class="badge capitalize {statusClass[lease.status]}">{lease.status}</span>
										<span class="font-semibold"
											>{lease.startDate} to {lease.endDate ?? 'month to month'}</span
										>
										<span class="opacity-80">{money(lease.rent)} / month</span>
									</div>
									{#if lease.tenants.length > 0}
										<ul class="text-sm" aria-label="Tenants">
											{#each lease.tenants as tenant (tenant.id)}
												<li>{tenant.name} <span class="opacity-70">({tenant.email})</span></li>
											{/each}
										</ul>
									{:else}
										<p class="text-sm opacity-70">No tenants</p>
									{/if}
									{#if lease.billing}
										<LeaseBilling
											leaseId={lease.id}
											billing={lease.billing}
											ended={lease.status === 'ended'}
										/>
									{/if}
								</div>
								<a
									href="/admin/properties/{propertyId}/leases/{lease.id}"
									class="btn btn-sm preset-tonal"
									aria-label="Edit lease from {lease.startDate}">Edit</a
								>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</Tabs.Content>
	</Tabs>
</div>
