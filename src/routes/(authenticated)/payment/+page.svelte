<script lang="ts">
	import { errorToast } from '$lib/Hooks/toasts';
	import { getModalStore, getToastStore, type ModalSettings } from '$lib/ui';
	import { type ZodError, z } from 'zod';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { successToast } from '$lib/Hooks/toasts';
	import { refresh } from '$lib/Hooks/refresh';
	import PaymentDialog from '$lib/Components/Payments/PaymentDialog.svelte';
	import type { OneTimeMethod } from '$lib/fees';

	type LeaseBalance = {
		id: string;
		address: string;
		status: string;
		startDate: string;
		endDate: string | null;
		balanceCents: number;
		dueDate: string | null;
		owed: { rentCents: number; depositCents: number; lateFeesCents: number };
		creditCents: number;
		/** The balance minus money already on its way. */
		payableCents: number;
		bankPayments: {
			pending: { amountCents: number; day: string }[];
			failed: { amountCents: number; day: string } | null;
		};
		autopay: {
			enrollment: { method: string; amountCents: number | null; type: string } | null;
			charge: {
				state: 'claimed' | 'pending' | 'failed' | 'gave-up';
				day: string;
				amountCents: number;
				attempts: number;
			} | null;
		};
	};
	export let data: { leases: LeaseBalance[] };

	// The due date is a calendar day (YYYY-MM-DD); parse it as local so it is not shifted a day.
	const dueDateOf = (lease: LeaseBalance) =>
		lease.dueDate ? new Date(`${lease.dueDate}T00:00:00`) : null;
	const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	/** A calendar day (YYYY-MM-DD) as a short local date. */
	const shortDate = (day: string) =>
		new Date(`${day}T00:00:00`).toLocaleString('en-us', { dateStyle: 'short' });

	/** The autopay amount typed for each lease that is not enrolled yet (blank: the full balance). */
	let autopayAmounts: Record<string, string> = {};
	let busy = false;

	const amountSchema = z
		.number()
		.gt(0, 'The amount must be greater than 0')
		.multipleOf(0.01, 'The amount must be a multiple of 0.01');

	/** A typed amount as dollars, null for blank, or undefined (after a toast) when it is not valid. */
	function parseAmount(value: string | undefined): number | null | undefined {
		if (value === undefined || String(value).trim() === '') return null;
		const amount = parseFloat(String(value));
		const result = amountSchema.safeParse(amount);
		if (!result.success) {
			errorToast(result.error.issues[0].message, toastStore);
			return undefined;
		}
		return amount;
	}

	async function startAutopay(lease: LeaseBalance) {
		const amount = parseAmount(autopayAmounts[lease.id]);
		if (amount === undefined || busy) return;
		busy = true;
		try {
			const response = await fetch('/api/autopay/setup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ leaseId: lease.id, amount })
			});
			if (!response.ok) {
				errorToast('Error starting autopay setup.', toastStore);
				return;
			}
			window.location.assign((await response.json()).url);
		} finally {
			busy = false;
		}
	}

	function changeAutopayAmount(lease: LeaseBalance) {
		const current = lease.autopay.enrollment?.amountCents;
		modalStore.trigger({
			type: 'prompt',
			title: 'Change autopay amount',
			body: 'The most autopay charges for each due date. Leave it blank to pay the full balance.',
			value: current ? (current / 100).toFixed(2) : '',
			valueAttr: { type: 'number', step: '0.01', min: '0.01' },
			response: async (response: string | false) => {
				if (response === false) return;
				const amount = parseAmount(response);
				if (amount === undefined) return;
				const result = await fetch('/api/autopay', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ leaseId: lease.id, amount })
				});
				if (result.ok) {
					successToast('Autopay amount saved.', toastStore);
					await refresh();
				} else {
					errorToast('Error saving the autopay amount.', toastStore);
				}
			}
		});
	}

	function turnOffAutopay(lease: LeaseBalance) {
		modalStore.trigger({
			type: 'confirm',
			title: 'Turn off autopay?',
			body: 'You will need to make payments yourself. A payment already processing is not affected.',
			buttonTextConfirm: 'Turn off',
			response: async (confirmed: boolean) => {
				if (!confirmed) return;
				const result = await fetch('/api/autopay', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ leaseId: lease.id })
				});
				if (result.ok) {
					successToast('Autopay is off.', toastStore);
					await refresh();
				} else {
					errorToast('Error turning off autopay.', toastStore);
				}
			}
		});
	}

	// Back from Stripe's setup page: finish enrolling, then drop the session id from the URL.
	onMount(async () => {
		const sessionId = page.url.searchParams.get('autopay_session');
		if (!sessionId) return;
		const response = await fetch('/api/autopay/complete', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sessionId })
		});
		if (response.ok) {
			successToast('Autopay is on.', toastStore);
		} else {
			errorToast('Autopay setup was not finished. Please try again.', toastStore);
		}
		await goto('/payment', { replaceState: true, invalidateAll: true });
	});

	async function startCheckout(lease: LeaseBalance, amount: number, method: OneTimeMethod) {
		if (lease.payableCents <= 0) {
			return;
		}
		const payable = lease.payableCents / 100;
		try {
			const balanceSchema = z
				.number()
				.gt(0, 'Number must be greater than 0')
				.lte(payable, `Number must be less than or equal to ${currency.format(payable)}`)
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
			body: JSON.stringify({ amount, leaseId: lease.id, method })
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
			type: 'component',
			component: {
				ref: PaymentDialog,
				props: {
					payableCents: lease.payableCents,
					onSubmit: (amount: number, method: OneTimeMethod) => startCheckout(lease, amount, method)
				}
			}
		};
		modalStore.trigger(paymentModal);
	}
</script>

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title="Payment" />
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<section class="card bg-surface-100-900 flex flex-col gap-4 p-4 sm:p-6">
			<h2 class="h4">Your current balance</h2>
			{#if data.leases.length === 0}
				<p role="status">
					You have no lease to pay for. If you expect one, please contact your property manager.
				</p>
			{/if}
			{#each data.leases as lease (lease.id)}
				{@const dueDate = dueDateOf(lease)}
				{@const autopay = lease.autopay}
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
						{#if lease.owed.depositCents > 0 || lease.owed.lateFeesCents > 0}
							<dl
								class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm"
								aria-label="Balance breakdown"
							>
								{#if lease.owed.lateFeesCents > 0}
									<dt class="opacity-70">Late fees</dt>
									<dd>{currency.format(lease.owed.lateFeesCents / 100)}</dd>
								{/if}
								{#if lease.owed.depositCents > 0}
									<dt class="opacity-70">Security deposit</dt>
									<dd>{currency.format(lease.owed.depositCents / 100)}</dd>
								{/if}
								<dt class="opacity-70">Rent</dt>
								<dd>{currency.format(lease.owed.rentCents / 100)}</dd>
							</dl>
							<p class="text-sm opacity-80">
								Payments go to late fees first, then the security deposit, then the oldest rent.
							</p>
						{/if}
					{/if}
					{#each lease.bankPayments.pending as pending, i (i)}
						<p class="text-sm" role="status" data-bank-pending>
							A bank payment of {currency.format(pending.amountCents / 100)} started on
							{shortDate(pending.day)} is processing.
						</p>
					{/each}
					{#if lease.bankPayments.failed}
						<p class="text-error-700-300 text-sm" role="status" data-bank-failed>
							Your bank payment of {currency.format(lease.bankPayments.failed.amountCents / 100)} started
							on {shortDate(lease.bankPayments.failed.day)} did not go through. The amount is still owed.
						</p>
					{/if}
					{#if lease.balanceCents > 0 && lease.payableCents <= 0}
						<p class="text-sm" role="status">Your balance is being paid.</p>
					{/if}
					{#if lease.creditCents > 0}
						<p class="text-sm">
							Credit: <strong>{currency.format(lease.creditCents / 100)}</strong>
						</p>
					{/if}
					<div class="flex flex-wrap items-center gap-2">
						<button
							data-needs-hydration
							class="btn preset-filled-primary-500"
							disabled={lease.payableCents <= 0}
							aria-label={data.leases.length > 1
								? `Make a Payment for ${lease.address}`
								: undefined}
							on:click={() => viewPaymentClicked(lease)}>Make a Payment</button
						>
					</div>
					<div class="border-surface-300-700 flex flex-col gap-2 border-t pt-3" data-autopay>
						<h3 class="font-semibold">Autopay</h3>
						{#if autopay.enrollment}
							<p>
								Autopay is <strong>on</strong> with your
								<strong>{autopay.enrollment.method}</strong>, paying
								<strong
									>{autopay.enrollment.amountCents === null
										? 'Full balance'
										: currency.format(autopay.enrollment.amountCents / 100)}</strong
								> on each due date.
							</p>
							{#if autopay.enrollment.type === 'card'}
								<p class="text-sm opacity-80">
									Card payments include a transaction fee of 2.9% + $0.30.
								</p>
							{/if}
							<div class="flex flex-wrap items-center gap-2">
								<button
									data-needs-hydration
									class="btn preset-tonal"
									on:click={() => changeAutopayAmount(lease)}>Change amount</button
								>
								<button
									data-needs-hydration
									class="btn preset-tonal-error"
									on:click={() => turnOffAutopay(lease)}>Turn off autopay</button
								>
							</div>
						{:else}
							<p class="text-sm opacity-80">
								Save a card or bank account and we charge it on each due date. Bank accounts have no
								fee; cards include a transaction fee of 2.9% + $0.30.
							</p>
							<div class="flex flex-wrap items-end gap-2">
								<label class="label w-48">
									<span class="label-text">Amount (optional)</span>
									<input
										class="input"
										type="number"
										min="0.01"
										step="0.01"
										placeholder="Full balance"
										bind:value={autopayAmounts[lease.id]}
									/>
								</label>
								<button
									data-needs-hydration
									class="btn preset-tonal"
									disabled={busy}
									aria-label={data.leases.length > 1
										? `Set up autopay for ${lease.address}`
										: undefined}
									on:click={() => startAutopay(lease)}>Set up autopay</button
								>
							</div>
						{/if}
						{#if autopay.charge?.state === 'pending' || autopay.charge?.state === 'claimed'}
							<p class="text-sm" role="status">
								An autopay payment of {currency.format(autopay.charge.amountCents / 100)} started on
								{shortDate(autopay.charge.day)} is processing.
							</p>
						{:else if autopay.charge?.state === 'failed'}
							<p class="text-error-700-300 text-sm" role="status">
								Your autopay payment of {currency.format(autopay.charge.amountCents / 100)} on
								{shortDate(autopay.charge.day)} did not go through. We will try again tomorrow.
							</p>
						{:else if autopay.charge?.state === 'gave-up'}
							<p class="text-error-700-300 text-sm" role="status">
								Autopay could not charge {currency.format(autopay.charge.amountCents / 100)} after several
								tries (last on {shortDate(autopay.charge.day)}). Please make a payment.
							</p>
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
