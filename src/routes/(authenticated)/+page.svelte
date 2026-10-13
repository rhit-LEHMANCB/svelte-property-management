<script lang="ts">
	import type { PageData } from './$types';
	import { IconFileText } from '@tabler/icons-svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';

	let { data }: { data: PageData } = $props();

	const isTenant = $derived(data.user.permissions !== 'admin');
	// Current and upcoming leases; an ended lease with money owed shows on the payment page.
	const leases = $derived(
		(data.userLeases ?? []).filter((lease) => lease.status !== 'ended').reverse()
	);
	const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
	// Lease dates are calendar days (YYYY-MM-DD); parse them as local so they are not shifted a day.
	const longDate = (day: string) =>
		new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'long' });
</script>

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title="Dashboard" />
	{#if isTenant && !data.userProperty}
		<div class="card preset-tonal-warning p-5" role="status">
			<strong>No property is assigned to your account yet.</strong>
			<p>Please contact your property manager. You can still update your profile.</p>
		</div>
	{/if}
	{#if isTenant}
		{#if leases.length === 0}
			<p class="opacity-80">No lease is on file.</p>
		{:else}
			<div class="grid gap-4 md:grid-cols-2">
				{#each leases as lease (lease.id)}
					<section class="card bg-surface-100-900 space-y-3 p-4 sm:p-6" aria-label="Your lease">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h2 class="h4">{lease.address}</h2>
							<span
								class="badge capitalize {lease.status === 'current'
									? 'preset-filled-success-500'
									: 'preset-filled-primary-500'}">{lease.status}</span
							>
						</div>
						<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
							<dt class="opacity-70">Dates</dt>
							<dd>
								{longDate(lease.startDate)} to {lease.endDate
									? longDate(lease.endDate)
									: 'month to month'}
							</dd>
							<dt class="opacity-70">Monthly rent</dt>
							<dd>{currency.format(lease.rent)}</dd>
							{#if lease.otherTenants.length > 0}
								<dt class="opacity-70">Also on the lease</dt>
								<dd>{lease.otherTenants.join(', ')}</dd>
							{/if}
						</dl>
						{#if lease.hasDocument}
							<a
								class="btn btn-sm preset-tonal"
								href="/api/lease/{lease.id}/document"
								target="_blank"
								rel="noopener"><IconFileText size={18} aria-hidden="true" />View lease document</a
							>
						{/if}
					</section>
				{/each}
			</div>
		{/if}
	{/if}
</div>
