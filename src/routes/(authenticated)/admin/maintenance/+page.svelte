<script lang="ts">
	import { IconCheck, IconClipboardCheck, IconTool } from '@tabler/icons-svelte';
	import type { PageData } from './$types';
	import { getModalStore, getToastStore } from '$lib/ui';
	import type { MaintenanceRequest } from '../../../../app';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { refresh } from '$lib/Hooks/refresh';
	import DataList, { type DataColumn } from '$lib/Components/DataList/DataList.svelte';
	import EmptyState from '$lib/Components/DataList/EmptyState.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import { formatDateTime } from '$lib/Components/DataList/format';

	let { data }: { data: PageData } = $props();

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	const openColumns: DataColumn<MaintenanceRequest>[] = [
		{ id: 'subject', label: 'Subject', sort: (r) => r.subject },
		{ id: 'opened', label: 'Opened', sort: (r) => r.dateAdded },
		{ id: 'submitter', label: 'Submitted by', sort: (r) => r.submitter },
		{ id: 'address', label: 'Address', sort: (r) => r.propertyAddress },
		{ id: 'description', label: 'Description' },
		{ id: 'actions', label: 'Actions', srOnly: true, class: 'text-right' }
	];

	const closedColumns: DataColumn<MaintenanceRequest>[] = [
		{ id: 'subject', label: 'Subject', sort: (r) => r.subject },
		{ id: 'closed', label: 'Closed', sort: (r) => r.dateClosed },
		{ id: 'submitter', label: 'Submitted by', sort: (r) => r.submitter },
		{ id: 'address', label: 'Address', sort: (r) => r.propertyAddress },
		{ id: 'workDone', label: 'Work done' }
	];

	const searchText = (r: MaintenanceRequest) =>
		`${r.subject} ${r.submitter} ${r.propertyAddress} ${r.description ?? ''} ${r.workDone ?? ''}`;

	function confirmModal(request: MaintenanceRequest) {
		modalStore.trigger({
			type: 'prompt',
			title: 'Close Maintenance Request',
			body: `Please provide the work you completed to close this maintenance request.`,
			response: (workDone: string) => {
				if (workDone) closeRequest(workDone, request.id);
			}
		});
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
			refresh();
		} else {
			errorToast('Error closing request.', toastStore);
		}
	}
</script>

{#snippet addressLink(request: MaintenanceRequest)}
	<a class="anchor" href={`/admin/properties/${request.propertyId}/edit`}
		>{request.propertyAddress}</a
	>
{/snippet}

<div class="space-y-8 p-4 sm:p-6">
	<PageHeader title="Maintenance" />
	<section class="space-y-3" aria-labelledby="open-requests">
		<h2 id="open-requests" class="h4">Open Maintenance Requests</h2>
		<DataList
			label="open maintenance requests"
			items={data.openMaintenanceRequests}
			key={(r) => r.id}
			columns={openColumns}
			sortBy="opened"
			sortDirection="desc"
			{searchText}
		>
			{#snippet cell(request, column)}
				{#if column.id === 'subject'}
					<strong>{request.subject}</strong>
				{:else if column.id === 'opened'}
					{formatDateTime(request.dateAdded)}
				{:else if column.id === 'submitter'}
					{request.submitter}
				{:else if column.id === 'address'}
					{@render addressLink(request)}
				{:else if column.id === 'description'}
					<span class="whitespace-pre-line">{request.description}</span>
				{:else if column.id === 'actions'}
					<div class="flex justify-end">
						<button
							data-needs-hydration
							type="button"
							class="btn btn-sm preset-filled-primary-500"
							aria-label="Close request {request.subject}"
							onclick={() => confirmModal(request)}
							><IconCheck class="size-4" aria-hidden="true" />Close</button
						>
					</div>
				{/if}
			{/snippet}
			{#snippet empty()}
				<EmptyState icon={IconClipboardCheck} title="No open maintenance requests">
					New requests from tenants appear here.
				</EmptyState>
			{/snippet}
		</DataList>
	</section>
	<section class="space-y-3" aria-labelledby="closed-requests">
		<h2 id="closed-requests" class="h4">Closed Maintenance Requests</h2>
		<DataList
			label="closed maintenance requests"
			items={data.closedMaintenanceRequests}
			key={(r) => r.id}
			columns={closedColumns}
			sortBy="closed"
			sortDirection="desc"
			{searchText}
		>
			{#snippet cell(request, column)}
				{#if column.id === 'subject'}
					<strong>{request.subject}</strong>
				{:else if column.id === 'closed'}
					{formatDateTime(request.dateClosed)}
				{:else if column.id === 'submitter'}
					{request.submitter}
				{:else if column.id === 'address'}
					{@render addressLink(request)}
				{:else if column.id === 'workDone'}
					<span class="whitespace-pre-line">{request.workDone ?? ''}</span>
				{/if}
			{/snippet}
			{#snippet empty()}
				<EmptyState icon={IconTool} title="No closed maintenance requests" />
			{/snippet}
		</DataList>
	</section>
</div>
