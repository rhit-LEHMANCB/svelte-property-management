<script lang="ts">
	import { IconCheck, IconTool } from '@tabler/icons-svelte';
	import type { PageData } from './$types';
	import { Pagination } from '@skeletonlabs/skeleton-svelte';
	import { getDialogStore, type DialogSettings } from '$lib/Hooks/dialogCompat';
	import type { MaintenanceRequest } from '../../../../app';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { invalidateAll } from '$app/navigation';

	export let data: PageData;
	const dialogStore = getDialogStore();

	let openPage = $state({
		page: 1,
		limit: 5,
		size: data.openMaintenanceRequests.length,
		amounts: [1, 2, 5, 10]
	});

	let closedPage = $state({
		page: 1,
		limit: 5,
		size: data.closedMaintenanceRequests.length,
		amounts: [1, 2, 5, 10]
	});

	let paginatedOpenRequests = $derived(data.openMaintenanceRequests.slice(
		(openPage.page - 1) * openPage.limit, // start
		(openPage.page - 1) * openPage.limit + openPage.limit // end
	));

	let paginatedClosedRequests = $derived(data.closedMaintenanceRequests.slice(
		(closedPage.page - 1) * closedPage.limit, // start
		(closedPage.page - 1) * closedPage.limit + closedPage.limit // end
	));

	function confirmModal(request: MaintenanceRequest) {
		const confirmModal: DialogSettings = {
			type: 'prompt',
			// Data
			title: 'Close Maintenance Request',
			body: `Please provide the work you completed to close this maintenance request.`,
			// TRUE if confirm pressed, FALSE if cancel pressed
			response: (response) => handleConfirmResponse(response, request.id)
		};
		dialogStore.trigger(confirmModal);
	}

	async function handleConfirmResponse(workDone: string, requestId: string) {
		if (workDone) {
			await closeRequest(workDone, requestId);
		}
	}

	async function closeRequest(workDone: string, id: string) {
		const response = await fetch(`/api/request/${id}/close`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ workDone })
		});
		if (response.ok) {
			successToast('Successfully closed request.');
			invalidateAll();
		} else {
			errorToast('Error closing request.');
		}
	}
</script>

<div class="grid grid-cols-1 md:grid-cols-2 m-5 gap-2">
	<div class="flex flex-col gap-2">
		<div class="card">
			<div class="h-auto m-5">
				<strong class="h3">Open Maintenance Requests</strong>
				{#if data.openMaintenanceRequests.length > 0}
					<dl class="list-dl pb-2">
						{#each paginatedOpenRequests as request}
							<div class="flex-row">
								<button
									class="btn-icon variant-filled-primary shrink-0"
									on:click={() => confirmModal(request)}><IconCheck /></button
								>
								<span class="flex-auto max-w-[90%] break-words">
									<dt class="flex flex-row gap-x-2 flex-wrap">
										<span class="font-bold min-w-0">{request.subject}</span><span
											>Opened: {request.dateAdded
												? request.dateAdded.toLocaleString('en-us', {
														dateStyle: 'short',
														timeStyle: 'short'
												  })
												: ''}</span
										><span>Submitted By: {request.submitter}</span><span
											>Address: <a
												class="text-secondary-500 underline"
												href={`/admin/properties/${request.propertyId}/edit`}
												>{request.propertyAddress}</a
											></span
										>
									</dt>
									<hr class="bg-primary-500 border-0 w-64" />
									<dd>{request.description}</dd>
								</span>
							</div>
						{/each}
					</dl>
				{:else}
					<p class="text-center my-12 text-lg">No open maintenance requests</p>
				{/if}
				<Pagination count={data.openMaintenanceRequests.length} pageSize={openPage.limit} page={openPage.page} onPageChange={(event) => openPage.page = event.page}>
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
		</div>
	</div>
	<div class="flex flex-col gap-2">
		<div class="card">
			<div class="h-auto m-5">
				<strong class="h3">Closed Maintenance Requests</strong>
				{#if data.closedMaintenanceRequests.length > 0}
					<dl class="list-dl pb-2">
						{#each paginatedClosedRequests as request}
							<div class="flex-row">
								<span class="badge-icon variant-filled-primary shrink-0"
									><IconTool size={16} /></span
								>
								<span class="flex-auto max-w-[90%] break-words">
									<dt class="flex flex-row gap-x-2 flex-wrap">
										<span class="font-bold min-w-0">{request.subject}</span><span
											>Closed: {request.dateClosed
												? request.dateClosed.toLocaleString('en-us', {
														dateStyle: 'short',
														timeStyle: 'short'
												  })
												: ''}</span
										><span>Submitted By: {request.submitter}</span><span
											>Address: <a
												class="text-secondary-500 underline"
												href={`/admin/properties/${request.propertyId}/view`}
												>{request.propertyAddress}</a
											></span
										>
									</dt>
									<hr class="bg-primary-500 border-0 w-64" />
									<dd>Work Done: {request.workDone ? request.workDone : ''}</dd>
								</span>
							</div>
						{/each}
					</dl>
				{:else}
					<p class="text-center my-12 text-lg">No closed maintenance requests</p>
				{/if}
				<Pagination count={data.closedMaintenanceRequests.length} pageSize={closedPage.limit} page={closedPage.page} onPageChange={(event) => closedPage.page = event.page}>
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
		</div>
	</div>
</div>
