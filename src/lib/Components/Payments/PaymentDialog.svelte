<script lang="ts">
	import { BANK_FEE_CENTS, cardFeeCents, oneTimeFeeCents, type OneTimeMethod } from '$lib/fees';
	import { Dialog } from '@skeletonlabs/skeleton-svelte';
	import { getModalStore } from '$lib/ui';
	import Field from '$lib/Components/Forms/Field.svelte';

	/**
	 * "Make a Payment": the amount and how to pay, each method with its fee for that amount. Shown
	 * in the shared modal; `onSubmit` gets the amount in dollars and the method, already checked
	 * against `payableCents`.
	 */
	let {
		payableCents,
		onSubmit
	}: {
		payableCents: number;
		onSubmit: (amount: number, method: OneTimeMethod) => void;
	} = $props();

	const modalStore = getModalStore();
	const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
	const format = (cents: number) => currency.format(cents / 100);

	let amount = $state('');
	let method = $state<OneTimeMethod>('card');
	let problem = $state('');

	/** The typed amount in whole cents, or null when it is not a valid amount yet. */
	const amountCents = $derived.by(() => {
		const value = Number.parseFloat(amount);
		if (!Number.isFinite(value) || value <= 0) return null;
		const cents = Math.round(value * 100);
		return Math.abs(value * 100 - cents) > 1e-6 ? null : cents;
	});
	const cardFee = $derived(amountCents === null ? null : cardFeeCents(amountCents));
	const total = $derived(
		amountCents === null ? null : amountCents + oneTimeFeeCents(method, amountCents)
	);

	/** Why the typed amount cannot be paid, or '' when it can. */
	function check() {
		const value = Number.parseFloat(amount);
		if (!Number.isFinite(value) || value <= 0) return 'The amount must be greater than 0.';
		if (amountCents === null) return 'The amount must be a multiple of 0.01.';
		if (amountCents > payableCents)
			return `The amount must be no more than ${format(payableCents)}.`;
		return '';
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		problem = check();
		if (problem || amountCents === null) return;
		modalStore.close();
		onSubmit(amountCents / 100, method);
	}
</script>

<form class="space-y-4" onsubmit={submit} novalidate data-payment-dialog>
	<Dialog.Title>
		{#snippet element(attributes)}
			<h2 {...attributes} class="h4">Make a Payment</h2>
		{/snippet}
	</Dialog.Title>
	<p class="text-sm opacity-80">You can pay up to {format(payableCents)} now.</p>
	<Field label="Amount" id="payment-amount" errors={problem ? [problem] : undefined}>
		{#snippet children({ attrs, invalid })}
			<input
				{...attrs}
				class="input"
				class:input-error={invalid}
				type="number"
				min="0.01"
				step="0.01"
				inputmode="decimal"
				required
				bind:value={amount}
				oninput={() => {
					// Once shown, the message follows what is typed.
					if (problem) problem = check();
				}}
			/>
		{/snippet}
	</Field>
	<fieldset class="space-y-2">
		<legend class="label-text mb-1">Pay with</legend>
		<label class="border-surface-300-700 flex cursor-pointer items-start gap-3 rounded border p-3">
			<input
				class="radio mt-1"
				type="radio"
				name="payment-method"
				value="card"
				bind:group={method}
			/>
			<span>
				<span class="block font-semibold">Card</span>
				<span class="block text-sm opacity-80">
					Fee 3%{cardFee === null ? '' : ` (${format(cardFee)})`}. Apple Pay and Google Pay work
					too.
				</span>
			</span>
		</label>
		<label class="border-surface-300-700 flex cursor-pointer items-start gap-3 rounded border p-3">
			<input
				class="radio mt-1"
				type="radio"
				name="payment-method"
				value="bank"
				bind:group={method}
			/>
			<span>
				<span class="block font-semibold">Bank account</span>
				<span class="block text-sm opacity-80">
					Fee {format(BANK_FEE_CENTS)}. Takes a few business days to complete.
				</span>
			</span>
		</label>
	</fieldset>
	{#if total !== null}
		<p data-payment-total>Total charged: <strong>{format(total)}</strong></p>
	{/if}
	<footer class="flex justify-end gap-2">
		<button type="button" class="btn preset-tonal" onclick={() => modalStore.close()}>Cancel</button
		>
		<button type="submit" class="btn preset-filled-primary-500">Continue to payment</button>
	</footer>
</form>
