<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import type { PageData } from './$types';
	import { maintenanceSchema } from '$lib/schemas';
	import { successToast } from '$lib/Hooks/toasts';
	import { getToastStore } from '$lib/ui';
	import { IconClipboardCheck, IconTool } from '@tabler/icons-svelte';
	import type { MaintenanceRequest } from '../../../app';
	import DataList, { type DataColumn } from '$lib/Components/DataList/DataList.svelte';
	import EmptyState from '$lib/Components/DataList/EmptyState.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import { formatDateTime } from '$lib/Components/DataList/format';

	let { data }: { data: PageData } = $props();
	const toastStore = getToastStore();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance } = superForm(data.form, {
		customValidity: true,
		validators: zodClient(maintenanceSchema),
		resetForm: true,
		onUpdated({ form }) {
			if (form.message === 'Form submitted') {
				successToast('Successfully added maintenance request.', toastStore);
			}
		}
	});

	const openColumns: DataColumn<MaintenanceRequest>[] = [
		{ id: 'subject', label: 'Subject', sort: (r) => r.subject },
		{ id: 'opened', label: 'Opened', sort: (r) => r.dateAdded },
		{ id: 'submitter', label: 'Submitted by', sort: (r) => r.submitter },
		{ id: 'description', label: 'Description' }
	];

	const closedColumns: DataColumn<MaintenanceRequest>[] = [
		{ id: 'subject', label: 'Subject', sort: (r) => r.subject },
		{ id: 'closed', label: 'Closed', sort: (r) => r.dateClosed },
		{ id: 'submitter', label: 'Submitted by', sort: (r) => r.submitter },
		{ id: 'workDone', label: 'Work done' }
	];

	const searchText = (r: MaintenanceRequest) =>
		`${r.subject} ${r.submitter} ${r.description ?? ''} ${r.workDone ?? ''}`;
</script>

<div class="space-y-8 p-4 sm:p-6">
	<PageHeader title="Maintenance" />
	<form
		method="POST"
		use:enhance
		class="card bg-surface-100-900 flex max-w-2xl flex-col gap-4 p-4 sm:p-6"
	>
		<h2 class="h4">Add Maintenance Request</h2>
		<label class="label"
			><span class="label-text">Subject</span><input
				name="subject"
				bind:value={$form.subject}
				class="input"
				class:input-error={$errors.subject}
				title="Subject"
				type="text"
			/></label
		>
		<label class="label"
			><span class="label-text">Description</span><textarea
				name="description"
				bind:value={$form.description}
				class="textarea"
				class:input-error={$errors.description}
				title="Description"
				rows="6"></textarea></label
		>
		<div>
			<button type="submit" class="btn preset-filled-primary-500">Add</button>
		</div>
	</form>

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
				{:else if column.id === 'description'}
					<span class="whitespace-pre-line">{request.description}</span>
				{/if}
			{/snippet}
			{#snippet empty()}
				<EmptyState icon={IconClipboardCheck} title="No open maintenance requests">
					Use the form above to report a problem with your home.
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
