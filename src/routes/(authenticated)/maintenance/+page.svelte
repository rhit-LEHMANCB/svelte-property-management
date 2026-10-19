<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import type { PageData } from './$types';
	import { maintenanceSchema } from '$lib/schemas';
	import { successToast } from '$lib/Hooks/toasts';
	import { getToastStore } from '$lib/ui';
	import { IconClipboardCheck, IconTool } from '@tabler/icons-svelte';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import type { MaintenanceRequest } from '../../../app';
	import DataList, { type DataColumn } from '$lib/Components/DataList/DataList.svelte';
	import EmptyState from '$lib/Components/DataList/EmptyState.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import PageBody from '$lib/Components/Shell/PageBody.svelte';
	import Card from '$lib/Components/Shell/Card.svelte';
	import Notice from '$lib/Components/Shell/Notice.svelte';
	import FormActions from '$lib/Components/Shell/FormActions.svelte';
	import Field from '$lib/Components/Forms/Field.svelte';
	import { errorsAfterSubmit } from '$lib/forms/errorsAfterSubmit';
	import { formProblem } from '$lib/forms/formProblem';
	import { formatDateTime } from '$lib/Components/DataList/format';

	let { data }: { data: PageData } = $props();
	const toastStore = getToastStore();

	// svelte-ignore state_referenced_locally
	const { markSubmitted, reset, shown: gate } = errorsAfterSubmit(data.form.posted);
	// svelte-ignore state_referenced_locally
	const { form, errors, message, enhance } = superForm(data.form, {
		validators: zodClient(maintenanceSchema),
		resetForm: true,
		onSubmit: () => markSubmitted(),
		onUpdated({ form }) {
			if (form.message === 'Form submitted') {
				// The form is cleared for the next request, so its errors start hidden again.
				reset();
				successToast('Successfully added maintenance request.', toastStore);
			}
		}
	});
	const shown = gate(errors);
	const problem = $derived(formProblem($message));

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

	// Lease dates are calendar days (YYYY-MM-DD); parse them as local so they are not shifted a day.
	const longDate = (day: string) =>
		new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'long' });

	// Open or Closed requests; only the selected list is rendered.
	let tab = $state('open');

	const searchText = (r: MaintenanceRequest) =>
		`${r.subject} ${r.submitter} ${r.description ?? ''} ${r.workDone ?? ''}`;
</script>

<PageBody>
	<PageHeader
		title="Maintenance"
		subtitle="Report a problem with your home and follow it until it is fixed."
	/>
	{#if data.noProperty}
		<Card title="Your requests">
			{#if data.noProperty.upcoming}
				<EmptyState icon={IconTool} title="Requests open when your lease starts">
					Your lease at {data.noProperty.upcoming.address} starts on
					{longDate(data.noProperty.upcoming.startDate)}. From then on you can report problems with
					your home here.
				</EmptyState>
			{:else}
				<EmptyState icon={IconTool} title="No property is assigned to your account yet.">
					Maintenance requests are for the home you rent. Please contact your property manager.
				</EmptyState>
			{/if}
		</Card>
	{:else}
		<Card title="New request">
			<form method="POST" use:enhance class="space-y-4" novalidate>
				<Field label="Subject" errors={$shown.subject}>
					{#snippet children({ attrs, invalid })}
						<input
							{...attrs}
							name="subject"
							bind:value={$form.subject}
							class="input"
							class:input-error={invalid}
							title="Subject"
							type="text"
						/>
					{/snippet}
				</Field>
				<Field label="Description" errors={$shown.description}>
					{#snippet children({ attrs, invalid })}
						<textarea
							{...attrs}
							name="description"
							bind:value={$form.description}
							class="textarea"
							class:input-error={invalid}
							title="Description"
							rows="6"></textarea>
					{/snippet}
				</Field>
				{#if problem}
					<Notice tone="error"><p>{problem}</p></Notice>
				{/if}
				<FormActions>
					<button type="submit" class="btn preset-filled-primary-500">Send request</button>
				</FormActions>
			</form>
		</Card>

		<Card title="Your requests">
			<Tabs value={tab} onValueChange={(details) => (tab = details.value)}>
				<Tabs.List class="border-surface-200-800 border-b">
					<Tabs.Trigger value="open" class="btn hover:preset-tonal"
						>Open ({data.openMaintenanceRequests.length})</Tabs.Trigger
					>
					<Tabs.Trigger value="closed" class="btn hover:preset-tonal"
						>Closed ({data.closedMaintenanceRequests.length})</Tabs.Trigger
					>
					<Tabs.Indicator class="bg-primary-500 h-0.5" />
				</Tabs.List>
				<Tabs.Content value="open" class="pt-4">
					{#if tab === 'open'}
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
									Use the New request form to report a problem with your home.
								</EmptyState>
							{/snippet}
						</DataList>
					{/if}
				</Tabs.Content>
				<Tabs.Content value="closed" class="pt-4">
					{#if tab === 'closed'}
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
					{/if}
				</Tabs.Content>
			</Tabs>
		</Card>
	{/if}
</PageBody>
