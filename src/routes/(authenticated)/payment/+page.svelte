<script lang="ts">
	import { errorToast } from '$lib/Hooks/toasts';
	import { getModalStore, getToastStore, type ModalSettings } from '$lib/ui';
	import { type ZodError, z } from 'zod';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';

	type LeaseBalance = {
		id: string;
		address: string;
		status: string;
		startDate: string;
		endDate: string | null;
		balanceCents: number;
		dueDate: string | null;
	};
	export let data: { leases: LeaseBalance[] };

	// The due date is a calendar day (YYYY-MM-DD); parse it as local so it is not shifted a day.
	const dueDateOf = (lease: LeaseBalance) =>
		lease.dueDate ? new Date(`${lease.dueDate}T00:00:00`) : null;
	const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	async function startCheckout(lease: LeaseBalance, response: string) {
		if (!response || lease.balanceCents <= 0) {
			return;
		}
		const balance = lease.balanceCents / 100;
		const amount = parseFloat(response);
		try {
			const balanceSchema = z
				.number()
				.gt(0, 'Number must be greater than 0')
				.lte(balance, `Number must be less than or equal to ${currency.format(balance)}`)
				.multipleOf(0.01, 'Number must be a multiple of 0.01');
			balanceSchema.parse(amount);
		} catch (error) {
			errorToast((error as ZodError).issues[0].message, toastStore);
			return;
		}
		const fetchResponse = await fetch(`/api/stripe/create-checkout-session/payment`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ amount, leaseId: lease.id })
		});
		if (fetchResponse.ok) {
			const body = await fetchResponse.json();
			window.location.assign(body.url);
		} else {
			errorToast('Error starting payment process.', toastStore);
		}
	}

	async function startCustomerPortal() {
		const response = await fetch(`/api/stripe/create-customer-portal`, {
			method: 'GET'
		});
		if (response.ok) {
			const body = await response.json();
			window.location.assign(body.url);
		} else {
			errorToast('Error starting customer portal.', toastStore);
		}
	}

	function viewPaymentClicked(lease: LeaseBalance) {
		const paymentModal: ModalSettings = {
			type: 'prompt',
			title: 'Enter Payment Amount',
			body: 'Provide the amount you would like to pay.\nNote: One-time payments are subject to a transaction fee. Please set up auto-pay to waive this fee.',
			// Populates the input value and attributes
			valueAttr: { type: 'number', required: true, step: '0.01' },
			response: (response: string) => startCheckout(lease, response)
		};
		modalStore.trigger(paymentModal);
	}
</script>

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title="Payment" />
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<section class="card bg-surface-100-900 flex flex-col gap-4 p-4 sm:p-6">
			<h2 class="h4">Your current balance</h2>
			{#each data.leases as lease (lease.id)}
				{@const dueDate = dueDateOf(lease)}
				<div class="flex flex-col gap-3" data-lease={lease.id}>
					{#if data.leases.length > 1}
						<h3 class="font-semibold">
							{lease.address}
							<span class="badge preset-tonal ml-1 capitalize">{lease.status}</span>
						</h3>
					{/if}
					{#if lease.balanceCents <= 0 || !dueDate}
						<p>You have nothing to pay</p>
					{:else}
						{@const amount = currency.format(lease.balanceCents / 100)}
						{@const due = dueDate.toLocaleString('en-us', { dateStyle: 'short' })}
						<p>You have a balance of <strong>{amount}</strong> due on {due}</p>
					{/if}
					<div class="flex flex-wrap items-center gap-2">
						<button
							data-needs-hydration
							class="btn preset-filled-primary-500"
							disabled={lease.balanceCents <= 0}
							aria-label={data.leases.length > 1
								? `Make a Payment for ${lease.address}`
								: undefined}
							on:click={() => viewPaymentClicked(lease)}>Make a Payment</button
						>
						{#if lease.status === 'current'}
							<button
								data-needs-hydration
								class="btn preset-tonal"
								on:click={() => viewPaymentClicked(lease)}>Set up auto pay</button
							>
						{/if}
					</div>
				</div>
			{/each}
		</section>
		<section class="card bg-surface-100-900 flex flex-col gap-4 p-4 sm:p-6">
			<h2 class="h4">Transaction History</h2>
			<p class="opacity-80">See past payments and manage payment methods in the Stripe portal.</p>
			<div>
				<button data-needs-hydration class="btn preset-tonal" on:click={startCustomerPortal}
					>View Portal</button
				>
			</div>
		</section>
	</div>
</div>
