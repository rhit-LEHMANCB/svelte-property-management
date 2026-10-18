<script lang="ts">
	import type { PageData } from './$types';
	import { IconFileText } from '@tabler/icons-svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import PageBody from '$lib/Components/Shell/PageBody.svelte';
	import Card from '$lib/Components/Shell/Card.svelte';
	import Notice from '$lib/Components/Shell/Notice.svelte';

	let { data }: { data: PageData } = $props();

	const isTenant = $derived(data.user.permissions !== 'admin');
	// Current and upcoming leases; an ended lease with money owed shows on the payment page.
	const leases = $derived(data.leaseCards.filter((lease) => lease.status !== 'ended').reverse());
	// Ended leases with a deposit, to show what was held, returned and kept.
	const pastLeases = $derived(data.leaseCards.filter((lease) => lease.status === 'ended'));
	const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
	const cents = (amount: number) => currency.format(amount / 100);
	// Lease dates are calendar days (YYYY-MM-DD); parse them as local so they are not shifted a day.
	const longDate = (day: string) =>
		new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'long' });
</script>

<PageBody>
	<PageHeader title="Dashboard" />
	{#if isTenant && data.notice?.kind === 'upcoming'}
		<Notice tone="info">
			<strong
				>Your lease at {data.notice.address} starts on {longDate(data.notice.startDate)}.</strong
			>
			{#if data.notice.owedCents > 0}
				<p>{cents(data.notice.owedCents)} can be paid now.</p>
				<a class="btn btn-sm preset-filled-primary-500" href="/payment">Make a payment</a>
			{:else}
				<p>
					Maintenance requests open once it starts. You can set up autopay now, so rent is paid on
					its due date.
				</p>
				<a class="btn btn-sm preset-tonal" href="/payment">Set up autopay</a>
			{/if}
		</Notice>
	{:else if isTenant && data.notice?.kind === 'none'}
		<Notice tone="warning">
			<strong>No property is assigned to your account yet.</strong>
			<p>Please contact your property manager. You can still update your profile.</p>
		</Notice>
	{/if}
	{#if isTenant}
		{#if leases.length === 0}
			<p class="opacity-80">No lease is on file.</p>
		{:else}
			<div class="grid gap-4 md:grid-cols-2">
				{#each leases as lease (lease.id)}
					<Card as="section" aria-label="Your lease" title={lease.address}>
						{#snippet actions()}
							<span
								class="badge capitalize {lease.status === 'current'
									? 'preset-filled-success-500'
									: 'preset-filled-primary-500'}">{lease.status}</span
							>
						{/snippet}
						<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
							<dt class="opacity-70">Dates</dt>
							<dd>
								{longDate(lease.startDate)} to {lease.endDate
									? longDate(lease.endDate)
									: 'month to month'}
							</dd>
							<dt class="opacity-70">Monthly rent</dt>
							<dd>{currency.format(lease.rent)}</dd>
							{#if lease.otherTenants?.length}
								<dt class="opacity-70">Also on the lease</dt>
								<dd>{lease.otherTenants?.join(', ')}</dd>
							{/if}
							{#if lease.deposit}
								<dt class="opacity-70">Security deposit</dt>
								<dd>
									{currency.format(lease.deposit.amount)}, due {longDate(lease.deposit.dueDate)}.
									{cents(lease.billing.deposit.paidCents)} paid and held.
								</dd>
							{/if}
							{#if lease.lateFee}
								<dt class="opacity-70">Late fee</dt>
								<dd>
									{currency.format(lease.lateFee)} if rent is not paid in full {lease.graceDays ??
										0}
									{lease.graceDays === 1 ? 'day' : 'days'} after it is due
								</dd>
							{/if}
							{#if lease.billing.creditCents > 0}
								<dt class="opacity-70">Credit</dt>
								<dd>{cents(lease.billing.creditCents)}</dd>
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
					</Card>
				{/each}
			</div>
		{/if}
		{#if pastLeases.length > 0}
			<h2 class="h4">Past leases</h2>
			<div class="grid gap-4 md:grid-cols-2">
				{#each pastLeases as lease (lease.id)}
					{@const deposit = lease.billing.deposit}
					<Card as="section" aria-label="Past lease">
						<h3 class="font-semibold">{lease.address}</h3>
						<p class="opacity-80">
							{longDate(lease.startDate)} to {lease.endDate ? longDate(lease.endDate) : ''}
						</p>
						<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
							<dt class="opacity-70">Deposit paid</dt>
							<dd>{cents(deposit.paidCents)}</dd>
							{#if deposit.settled && deposit.settlement}
								<dt class="opacity-70">Returned</dt>
								<dd>{currency.format(deposit.settlement.returned)}</dd>
								{#each deposit.settlement.deductions as deduction}
									<dt class="opacity-70">Kept</dt>
									<dd>{currency.format(deduction.amount)} for {deduction.reason}</dd>
								{/each}
							{:else}
								<dt class="opacity-70">Held</dt>
								<dd>{cents(deposit.heldCents)}, not yet settled</dd>
							{/if}
						</dl>
					</Card>
				{/each}
			</div>
		{/if}
	{/if}
</PageBody>
