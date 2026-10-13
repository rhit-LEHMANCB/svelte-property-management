<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { IconArrowLeft, IconFileText, IconTrash } from '@tabler/icons-svelte';
	import LeaseForm from '$lib/Components/Forms/LeaseForm.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { getModalStore, getToastStore } from '$lib/ui';

	let { data }: { data: PageData } = $props();

	const toastStore = getToastStore();
	const modalStore = getModalStore();
	const backHref = $derived(`/admin/properties/${data.property.id}/edit?tab=leases`);

	function confirmDelete() {
		modalStore.trigger({
			type: 'confirm',
			title: 'Delete this lease?',
			body: 'The lease and its document will be removed. Tenant accounts are kept.',
			response: (confirmed: boolean) => {
				if (confirmed) deleteLease();
			}
		});
	}

	async function deleteLease() {
		const response = await fetch(`/api/lease/${data.lease.id}`, { method: 'DELETE' });
		if (response.ok) {
			successToast('Lease deleted.', toastStore);
			await goto(backHref);
		} else {
			const body = await response.json().catch(() => undefined);
			errorToast(body?.message ?? 'Error deleting the lease.', toastStore);
		}
	}
</script>

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title="Edit lease">
		<a href={backHref} class="btn btn-sm preset-tonal"
			><IconArrowLeft class="size-4" aria-hidden="true" />{data.property.title}</a
		>
	</PageHeader>
	<div class="flex flex-wrap items-center gap-3">
		<p class="opacity-80">{data.property.address}</p>
		<span class="badge preset-tonal capitalize">{data.lease.status}</span>
		{#if data.lease.hasDocument}
			<a class="anchor inline-flex items-center gap-1" href="/api/lease/{data.lease.id}/document"
				><IconFileText size={18} aria-hidden="true" />View document</a
			>
		{/if}
	</div>
	{#if data.lease.missingTenants > 0}
		<div class="card preset-tonal-warning p-4" role="status">
			{data.lease.missingTenants === 1
				? '1 tenant on this lease no longer has an account and'
				: `${data.lease.missingTenants} tenants on this lease no longer have accounts and`} will be removed
			from it when you save.
		</div>
	{/if}
	<div class="card bg-surface-100-900 p-4 sm:p-6">
		<LeaseForm
			data={data.form}
			propertyId={data.property.id}
			documentName={data.lease.documentName}
		/>
	</div>
	<div class="card bg-surface-100-900 flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
		<p class="max-w-prose opacity-80">
			A lease with recorded payments cannot be deleted. Set an end date instead.
		</p>
		<button
			data-needs-hydration
			type="button"
			class="btn preset-filled-error-500"
			onclick={confirmDelete}><IconTrash size={18} aria-hidden="true" />Delete lease</button
		>
	</div>
</div>
