<script lang="ts">
	import { IconCheck, IconTool } from '@tabler/icons-svelte';
	import type { PageData } from './$types';
	import {
		Pagination,
		getDialogStore,
		type DialogSettings,
		getToastStore
	} from '@skeletonlabs/skeleton-svelte';
	import type { MaintenanceRequest } from '../../../../app';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { invalidateAll } from '$app/navigation';

	export let data: PageData;
	const dialogStore = getDialogStore();
	const toastStore = getToastStore();

	let openPage = {
		page: 0,
		limit: 5,
		size: data.openMaintenanceRequests.length,
		amounts: [1, 2, 5, 10]
	};

	let closedPage = {
		page: 0,
		limit: 5,
		size: data.closedMaintenanceRequests.length,
		amounts: [1, 2, 5, 10]
	};

	$: paginatedOpenRequests = data.openMaintenanceRequests.slice(
		openPage.page * openPage.limit, // start
		openPage.page * openPage.limit + openPage.limit // end
	);

	$: paginatedClosedRequests = data.closedMaintenanceRequests.slice(
		closedPage.page * closedPage.limit, // start
		closedPage.page * closedPage.limit + closedPage.limit // end
	);

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
			successToast('Successfully closed request.', toastStore);
			invalidateAll();
		} else {
			errorToast('Error closing request.', toastStore);
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
				<Pagination
					bind:settings={openPage}
					showFirstLastButtons={false}
					showPreviousNextButtons={true}
				/>
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
				<Pagination
					bind:settings={openPage}
					showFirstLastButtons={false}
					showPreviousNextButtons={true}
				/>
			</div>
		</div>
	</div>
</div>
