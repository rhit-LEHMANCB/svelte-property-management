<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { IconFileText, IconTrash } from '@tabler/icons-svelte';
	import LeaseForm from '$lib/Components/Forms/LeaseForm.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import PageBody from '$lib/Components/Shell/PageBody.svelte';
	import Card from '$lib/Components/Shell/Card.svelte';
	import Notice from '$lib/Components/Shell/Notice.svelte';
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

<PageBody>
	<PageHeader
		title="Edit lease"
		breadcrumbs={[
			{ label: 'Properties', href: '/admin/properties' },
			{ label: data.property.title, href: backHref },
			{ label: 'Edit lease' }
		]}
		subtitle={data.property.address}
	>
		<div class="flex flex-wrap items-center gap-3">
			<span class="badge preset-tonal capitalize">{data.lease.status}</span>
			{#if data.lease.hasDocument}
				<a class="anchor inline-flex items-center gap-1" href="/api/lease/{data.lease.id}/document"
					><IconFileText size={18} aria-hidden="true" />View document</a
				>
			{/if}
		</div>
	</PageHeader>
	{#if data.lease.hasPayments}
		<Notice tone="warning">
			This lease has recorded payments. Changing its dates changes which months are billed: months
			before the start date or after the end date are no longer owed.
		</Notice>
	{/if}
	{#if data.lease.missingTenants > 0}
		<Notice tone="warning">
			{data.lease.missingTenants === 1
				? '1 tenant on this lease no longer has an account and'
				: `${data.lease.missingTenants} tenants on this lease no longer have accounts and`} will be removed
			from it when you save.
		</Notice>
	{/if}
	<LeaseForm
		data={data.form}
		propertyId={data.property.id}
		documentName={data.lease.documentName}
	/>
	<Card title="Delete lease">
		<div class="flex flex-wrap items-center justify-between gap-3">
			{#if data.lease.hasPayments}
				<p class="max-w-prose opacity-80">
					This lease has recorded payments, so it cannot be deleted. Set an end date instead.
				</p>
			{/if}
			<button
				data-needs-hydration
				type="button"
				class="btn preset-filled-error-500"
				disabled={data.lease.hasPayments}
				onclick={confirmDelete}><IconTrash size={18} aria-hidden="true" />Delete lease</button
			>
		</div>
	</Card>
</PageBody>
