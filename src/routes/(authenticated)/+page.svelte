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
	const summary = $derived(data.summary);
	const insurance = $derived(data.summary.insurance);
	const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
	const cents = (amount: number) => currency.format(amount / 100);
	// Lease dates are calendar days (YYYY-MM-DD); parse them as local so they are not shifted a day.
	const longDate = (day: string) =>
		new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'long' });

	const insuranceBadge = {
		'on-file': { label: 'On file', class: 'preset-filled-success-500' },
		'ending-soon': { label: 'Ending soon', class: 'preset-tonal-warning' },
		expired: { label: 'Expired', class: 'preset-tonal-error' },
		missing: { label: 'Missing', class: 'preset-tonal-error' }
	} as const;
</script>

{#snippet tile(label: string, value: string, detail: string)}
	<div class="flex flex-col gap-1">
		<span class="text-xs font-medium opacity-80">{label}</span>
		<span class="text-3xl font-bold">{value}</span>
		<span class="opacity-80">{detail}</span>
	</div>
{/snippet}

<PageBody>
	<PageHeader title="Dashboard" subtitle={leases[0]?.address} />
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
	{#if isTenant && leases.length > 0}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<Card as="section" aria-label="Balance">
				{@render tile(
					'Balance due',
					cents(summary.balanceCents),
					summary.dueDate ? `Due ${longDate(summary.dueDate)}` : 'Nothing is due right now.'
				)}
				{#if summary.balanceCents > 0}
					<a class="btn preset-filled-primary-500" href="/payment">Make a payment</a>
				{/if}
			</Card>
			<Card as="section" aria-label="Autopay">
				{@render tile(
					'Autopay',
					summary.autopayOn ? 'On' : 'Off',
					summary.autopayOn
						? 'Rent is paid for you on each due date.'
						: 'Have rent paid for you on each due date.'
				)}
				<a class="btn preset-tonal" href="/payment"
					>{summary.autopayOn ? 'Manage autopay' : 'Set up autopay'}</a
				>
			</Card>
			<Card as="section" aria-label="Maintenance">
				{@render tile(
					'Open maintenance requests',
					String(summary.openRequests),
					summary.hasProperty ? 'For the home you rent.' : 'Requests open when your lease starts.'
				)}
				<a class="btn preset-tonal" href="/maintenance">View requests</a>
			</Card>
		</div>
	{/if}
	{#if isTenant}
		<div class="grid items-start gap-4 md:grid-cols-2">
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
								{currency.format(lease.lateFee)} if rent is not paid in full {lease.graceDays ?? 0}
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
			<Card as="section" aria-label="Renters insurance" title="Renters insurance">
				{#snippet actions()}
					<span class="badge {insuranceBadge[insurance.state].class}"
						>{insuranceBadge[insurance.state].label}</span
					>
				{/snippet}
				{#if insurance.state === 'missing'}
					<p class="opacity-80">No renters insurance policy is on file.</p>
					<a class="btn preset-tonal" href="/insurance">Add insurance</a>
				{:else}
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
						{#if insurance.companyName}
							<dt class="opacity-70">Company</dt>
							<dd>{insurance.companyName}</dd>
						{/if}
						<dt class="opacity-70">{insurance.state === 'expired' ? 'Ended' : 'Ends'}</dt>
						<dd>{longDate(insurance.endDate)}</dd>
					</dl>
					<a class="btn preset-tonal" href="/insurance">Update insurance</a>
				{/if}
			</Card>
		</div>
		{#if pastLeases.length > 0}
			<Card title="Past leases">
				<div class="grid gap-4 md:grid-cols-2">
					{#each pastLeases as lease (lease.id)}
						{@const deposit = lease.billing.deposit}
						<section
							aria-label="Past lease"
							class="bg-surface-50-950 space-y-2 rounded-container p-4"
						>
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
						</section>
					{/each}
				</div>
			</Card>
		{/if}
	{/if}
</PageBody>
