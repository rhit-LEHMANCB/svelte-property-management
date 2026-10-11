<script lang="ts">
	import { errorToast } from '$lib/Hooks/toasts';
	import { getModalStore, getToastStore, type ModalSettings } from '$lib/ui';
	import { type ZodError, z } from 'zod';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';

	export let data: { balanceCents: number; dueDate: string | null };

	$: balance = data.balanceCents / 100;
	// The due date is a calendar day (YYYY-MM-DD); parse it as local so it is not shifted a day.
	$: balanceDueDate = data.dueDate ? new Date(`${data.dueDate}T00:00:00`) : null;
	const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	async function startCheckout(response: string) {
		if (!response || data.balanceCents <= 0) {
			return;
		}
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
			body: JSON.stringify({ amount })
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

	// Provide the modal settings
	const paymentModal: ModalSettings = {
		type: 'prompt',
		// Data
		title: 'Enter Payment Amount',
		body: 'Provide the amount you would like to pay.\nNote: One-time payments are subject to a transaction fee. Please set up auto-pay to waive this fee.',
		// Populates the input value and attributes
		valueAttr: { type: 'number', required: true, step: '0.01' },
		// Returns the updated response value
		response: startCheckout
	};

	function viewPaymentClicked() {
		modalStore.trigger(paymentModal);
	}
</script>

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title="Payment" />
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<section class="card bg-surface-100-900 flex flex-col gap-4 p-4 sm:p-6">
			<h2 class="h4">Your current balance</h2>
			{#if data.balanceCents <= 0 || !balanceDueDate}
				<p>You have nothing to pay</p>
			{:else}
				<p>
					You have a balance of <strong>{currency.format(balance)}</strong> due on {balanceDueDate.toLocaleString(
						'en-us',
						{
							dateStyle: 'short'
						}
					)}
				</p>
			{/if}
			<div class="flex flex-wrap items-center gap-2">
				<button
					data-needs-hydration
					class="btn preset-filled-primary-500"
					disabled={data.balanceCents <= 0}
					on:click={viewPaymentClicked}>Make a Payment</button
				>
				<button data-needs-hydration class="btn preset-tonal" on:click={viewPaymentClicked}
					>Set up auto pay</button
				>
			</div>
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
