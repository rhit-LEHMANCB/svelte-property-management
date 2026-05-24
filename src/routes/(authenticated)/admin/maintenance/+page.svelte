<script lang="ts">
	import { IconCheck, IconTool } from '@tabler/icons-svelte';
	import type { PageData } from './$types';
	import { Pagination, Modal } from '@skeletonlabs/skeleton-svelte';
	import type { MaintenanceRequest } from '../../../../app';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { invalidateAll } from '$app/navigation';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let workDoneInput = $state('');
	let selectedRequest: MaintenanceRequest | null = $state(null);
	let closeModalOpen = $state(false);

	let openPage = $state({
		page: 0,
		limit: 5,
		size: data.openMaintenanceRequests.length,
		amounts: [1, 2, 5, 10]
	});

	let closedPage = $state({
		page: 0,
		limit: 5,
		size: data.closedMaintenanceRequests.length,
		amounts: [1, 2, 5, 10]
	});

	let paginatedOpenRequests = $derived(
		data.openMaintenanceRequests.slice(
			openPage.page * openPage.limit,
			openPage.page * openPage.limit + openPage.limit
		)
	);

	let paginatedClosedRequests = $derived(
		data.closedMaintenanceRequests.slice(
			closedPage.page * closedPage.limit,
			closedPage.page * closedPage.limit + closedPage.limit
		)
	);

	function confirmModal(request: MaintenanceRequest) {
		selectedRequest = request;
		closeModalOpen = true;
	}

	async function handleConfirmResponse(confirmed: boolean) {
		if (confirmed && workDoneInput && selectedRequest) {
			await closeRequest(workDoneInput, selectedRequest.id);
		}
		closeModalOpen = false;
		workDoneInput = '';
		selectedRequest = null;
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

{#snippet closeModalContent()}
	<div class="card p-4 space-y-4 w-[400px] max-w-[90vw]">
		<header class="text-xl font-bold">Close Maintenance Request</header>
		<p>Please provide the work you completed to close this maintenance request.</p>
		<textarea
			bind:value={workDoneInput}
			class="textarea"
			rows="4"
			placeholder="Describe the work done..."
		></textarea>
		<footer class="flex justify-end gap-2">
			<button
				type="button"
				class="btn preset-tonal-surface"
				onclick={() => (closeModalOpen = false)}
			>
				Cancel
			</button>
			<button
				type="button"
				class="btn preset-filled-primary-500"
				onclick={() => handleConfirmResponse(true)}
			>
				Close Request
			</button>
		</footer>
	</div>
{/snippet}

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
									class="btn-icon preset-filled-primary-500 shrink-0"
									onclick={() => confirmModal(request)}
								>
									<IconCheck />
								</button>
								<span class="flex-auto max-w-[90%] break-words">
									<dt class="flex flex-row gap-x-2 flex-wrap">
										<span class="font-bold min-w-0">{request.subject}</span>
										<span
											>Opened: {request.dateAdded
												? request.dateAdded.toLocaleString('en-us', {
														dateStyle: 'short',
														timeStyle: 'short'
													})
												: ''}</span
										>
										<span>Submitted By: {request.submitter}</span>
										<span
											>Address: <a
												class="text-secondary-500 underline"
												href={`/admin/properties/${request.propertyId}/edit`}
											>
												{request.propertyAddress}
											</a></span
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
					data={data.openMaintenanceRequests}
					page={openPage.page}
					pageSize={openPage.limit}
					onPageChange={(details) => (openPage.page = details.page)}
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
								<span class="badge-icon preset-filled-primary-500 shrink-0">
									<IconTool size={16} />
								</span>
								<span class="flex-auto max-w-[90%] break-words">
									<dt class="flex flex-row gap-x-2 flex-wrap">
										<span class="font-bold min-w-0">{request.subject}</span>
										<span
											>Closed: {request.dateClosed
												? request.dateClosed.toLocaleString('en-us', {
														dateStyle: 'short',
														timeStyle: 'short'
													})
												: ''}</span
										>
										<span>Submitted By: {request.submitter}</span>
										<span
											>Address: <a
												class="text-secondary-500 underline"
												href={`/admin/properties/${request.propertyId}/view`}
											>
												{request.propertyAddress}
											</a></span
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
					data={data.closedMaintenanceRequests}
					page={closedPage.page}
					pageSize={closedPage.limit}
					onPageChange={(details) => (closedPage.page = details.page)}
				/>
			</div>
		</div>
	</div>
</div>

{#if closeModalOpen}
	<Modal
		open={closeModalOpen}
		onOpenChange={(details) => (closeModalOpen = details.open)}
		content={closeModalContent}
	/>
{/if}
