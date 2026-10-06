<script lang="ts">
	import { errorToast } from '$lib/Hooks/toasts';
	import { getModalStore, getToastStore, type ModalSettings } from '$lib/ui';
	import { type ZodError, z } from 'zod';

	let balance = 1000.0;
	let balanceDueDate = new Date();

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	async function startCheckout(response: string) {
		if (!response) {
			return;
		}
		const amount = parseFloat(response);
		try {
			const balanceSchema = z
				.number()
				.gt(0, 'Number must be greater than 0')
				.lte(balance, `Number must be less than or equal to ${balance}`)
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

<div class="grid grid-cols-1 md:grid-cols-2 m-5 gap-2">
	<div class="flex flex-col gap-2">
		<div class="card">
			<div class="h-auto m-5">
				<strong class="h3">Your current balance</strong>
				<div class="flex flex-col gap-5">
					{#if balance == 0}
						<span>You have nothing to pay</span>
					{:else}
						<span
							>You have a balance of ${balance.toLocaleString()} due on {balanceDueDate.toLocaleString(
								'en-us',
								{
									dateStyle: 'short'
								}
							)}</span
						>
					{/if}
					<div class="flex flex-row gap-2 items-center">
						<button class="btn preset-filled-secondary-500" on:click={viewPaymentClicked}
							>Make a Payment</button
						>
						<button class="btn preset-filled-primary-500" on:click={viewPaymentClicked}
							>Set up auto pay</button
						>
					</div>
				</div>
			</div>
		</div>
	</div>
	<div class="flex flex-col gap-2">
		<div class="card">
			<div class="h-auto m-5">
				<strong class="h3">Transaction History</strong>
				<div>
					<button class="btn preset-filled-secondary-500 mt-5" on:click={startCustomerPortal}
						>View Portal</button
					>
				</div>
			</div>
		</div>
	</div>
</div>
