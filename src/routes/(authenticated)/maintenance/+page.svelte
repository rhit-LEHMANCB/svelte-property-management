<script lang="ts">
	import { superForm } from 'sveltekit-superforms/client';
	import type { PageData } from './$types';
	import { maintenanceSchema } from '$lib/schemas';
	import { successToast } from '$lib/Hooks/toasts';
	import { Accordion } from '@skeletonlabs/skeleton-svelte';
	import { IconTool } from '@tabler/icons-svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const { form, errors, enhance } = superForm(data.form, {
		customValidity: true,
		validators: maintenanceSchema,
		resetForm: true,
		onUpdated({ form }) {
			if (form.message === 'Form submitted') {
				successToast('Successfully added maintenance request.');
			}
		}
	});
</script>

<div class="grid grid-cols-1 md:grid-cols-2 m-5 gap-2">
	<div class="flex flex-col gap-2">
		<div class="card">
			<form method="POST" use:enhance class="h-auto m-5">
				<strong class="h3">Add Maintenance Request</strong>
				<div class="flex flex-col gap-2 mt-2">
					<div>
						<label class="label"
							><span>Subject</span><input
								name="subject"
								bind:value={$form.subject}
								class="input"
								class:input-error={$errors.subject}
								title="Subject"
								type="text"
							/></label
						>
					</div>
					<div>
						<label class="label"
							><span>Description</span><textarea
								name="description"
								bind:value={$form.description}
								class="input"
								class:input-error={$errors.description}
								title="Description"
								rows="6"
							></textarea></label
						>
					</div>
				</div>
				<button type="submit" class="btn preset-filled-secondary-500 mt-5">Add</button>
			</form>
		</div>
	</div>
	<Accordion value={['open', 'closed']}>
		<div class="card p-5 pt-0 space-y-2">
			<Accordion.Item value="open">
				{#snippet control()}
					<div class="pt-5"><strong class="h3">Open Maintenance Requests</strong></div>
				{/snippet}
				{#snippet panel()}
					{#if data.openMaintenanceRequests.length > 0}
						<dl class="list-dl">
							{#each data.openMaintenanceRequests as request}
								<div class="flex-row">
									<span class="badge-icon preset-filled-primary-500 shrink-0">
										<IconTool size={16} />
									</span>
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
				{/snippet}
			</Accordion.Item>
		</div>
		<div class="card p-5 pt-0 space-y-2">
			<Accordion.Item value="closed">
				{#snippet control()}
					<div class="pt-5"><strong class="h3">Closed Maintenance Requests</strong></div>
				{/snippet}
				{#snippet panel()}
					{#if data.closedMaintenanceRequests.length > 0}
						<dl class="list-dl">
							{#each data.closedMaintenanceRequests as request}
								<div class="flex-row">
									<span class="badge-icon preset-filled-primary-500 shrink-0">
										<IconTool size={16} />
									</span>
									<span class="flex-auto max-w-[90%] break-words">
										<dt class="flex flex-row gap-x-2 flex-wrap">
											<span class="font-bold min-w-0">{request.subject}</span>
											<span
												>Opened: {request.dateClosed
													? request.dateClosed.toLocaleString('en-us', {
															dateStyle: 'short',
															timeStyle: 'short'
														})
													: ''}</span
											>
											<span>Submitted By: {request.submitter}</span>
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
				{/snippet}
			</Accordion.Item>
		</div>
	</Accordion>
</div>
