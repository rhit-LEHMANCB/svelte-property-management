<script lang="ts">
	import { goto } from '$app/navigation';
	import { errorToast } from '$lib/Hooks/toasts';
	import { Modal } from '@skeletonlabs/skeleton-svelte';
	import { ZodError, z } from 'zod';

	let balance = $state(1000.0);
	let balanceDueDate = $state(new Date());
	let paymentModalOpen = $state(false);
	let paymentAmount = $state('');

	async function startCheckout() {
		if (!paymentAmount) {
			return;
		}
		const amount = parseFloat(paymentAmount);
		try {
			const balanceSchema = z.number().gt(0).lte(balance).multipleOf(0.01);
			balanceSchema.parse(amount);
		} catch (error) {
			errorToast((error as ZodError).errors[0].message);
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
			goto(body.url);
		} else {
			errorToast('Error starting payment process.');
		}
	}

	async function startCustomerPortal() {
		const response = await fetch(`/api/stripe/create-customer-portal`, {
			method: 'GET'
		});
		if (response.ok) {
			const body = await response.json();
			goto(body.url);
		} else {
			errorToast('Error starting customer portal.');
		}
	}

	function viewPaymentClicked() {
		paymentModalOpen = true;
	}
</script>

{#snippet paymentModalContent()}
	<div class="card p-4 space-y-4 w-[400px] max-w-[90vw]">
		<header class="text-xl font-bold">Enter Payment Amount</header>
		<p>Provide the amount you would like to pay.</p>
		<p class="text-sm text-surface-500">
			Note: One-time payments are subject to a transaction fee. Please set up auto-pay to waive this
			fee.
		</p>
		<input
			type="number"
			bind:value={paymentAmount}
			class="input"
			step="0.01"
			min="0.01"
			max={balance}
			required
		/>
		<footer class="flex justify-end gap-2">
			<button
				type="button"
				class="btn preset-tonal-surface"
				onclick={() => (paymentModalOpen = false)}>Cancel</button
			>
			<button
				type="button"
				class="btn preset-filled-primary-500"
				onclick={() => {
					paymentModalOpen = false;
					startCheckout();
				}}>Pay</button
			>
		</footer>
	</div>
{/snippet}

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
								{ dateStyle: 'short' }
							)}</span
						>
					{/if}
					<div class="flex flex-row gap-2 items-center">
						<button class="btn preset-filled-secondary-500" onclick={viewPaymentClicked}
							>Make a Payment</button
						>
						<button class="btn preset-filled-primary-500" onclick={viewPaymentClicked}
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
					<button class="btn preset-filled-secondary-500 mt-5" onclick={startCustomerPortal}
						>View Portal</button
					>
				</div>
			</div>
		</div>
	</div>
</div>

{#if paymentModalOpen}
	<Modal
		open={paymentModalOpen}
		onOpenChange={(details) => (paymentModalOpen = details.open)}
		content={paymentModalContent}
	/>
{/if}
