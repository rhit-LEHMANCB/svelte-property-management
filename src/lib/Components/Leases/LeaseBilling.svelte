<script lang="ts">
	import { IconPlus, IconTrash } from '@tabler/icons-svelte';
	import type { LeaseBilling } from '$lib/leaseTypes';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { refresh } from '$lib/Hooks/refresh';
	import { getToastStore } from '$lib/ui';
	import Field from '$lib/Components/Forms/Field.svelte';
	import FormActions from '$lib/Components/Shell/FormActions.svelte';
	import Notice from '$lib/Components/Shell/Notice.svelte';

	let { leaseId, billing, ended }: { leaseId: string; billing: LeaseBilling; ended: boolean } =
		$props();

	const toastStore = getToastStore();
	const money = (cents: number) =>
		(cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

	let busy = $state(false);

	async function waive(month: string, label: string) {
		busy = true;
		try {
			const response = await fetch(`/api/lease/${leaseId}/late-fees/${month}/waive`, {
				method: 'POST'
			});
			if (response.ok) {
				successToast(`Late fee for ${label} waived.`, toastStore);
				await refresh();
			} else {
				const body = await response.json().catch(() => undefined);
				errorToast(body?.message ?? 'Error waiving the late fee.', toastStore);
			}
		} finally {
			busy = false;
		}
	}

	// The settlement form, filled from the current settlement when correcting one.
	let settling = $state(false);
	let returned = $state<number | undefined>();
	let deductions = $state<{ amount: number | undefined; reason: string }[]>([]);
	let errors = $state<{ returned?: string; total?: string; deductions?: Record<number, string> }>(
		{}
	);

	function openSettlement() {
		const current = billing.deposit.settlement;
		returned = current ? current.returned : billing.deposit.paidCents / 100;
		deductions = current ? current.deductions.map((d) => ({ ...d })) : [];
		errors = {};
		settling = true;
	}

	async function saveSettlement(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		try {
			const response = await fetch(`/api/lease/${leaseId}/deposit/settlement`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ returned, deductions })
			});
			const body = await response.json().catch(() => undefined);
			if (response.ok) {
				successToast('Deposit settlement saved.', toastStore);
				settling = false;
				await refresh();
			} else if (response.status === 400 && body?.errors) {
				errors = body.errors;
			} else {
				errorToast(body?.message ?? 'Error saving the settlement.', toastStore);
			}
		} finally {
			busy = false;
		}
	}
</script>

<div class="space-y-2 text-sm" aria-label="Billing">
	<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
		<dt class="opacity-70">Owed</dt>
		<dd>
			{money(billing.totalCents)}
			{#if billing.totalCents > 0 && billing.dueDate}
				<span class="opacity-70">(due {billing.dueDate})</span>
			{/if}
		</dd>
		{#if billing.creditCents > 0}
			<dt class="opacity-70">Credit</dt>
			<dd>{money(billing.creditCents)}</dd>
		{/if}
		{#if billing.deposit.amountCents > 0 || billing.deposit.paidCents > 0}
			<dt class="opacity-70">Deposit</dt>
			<dd class="flex flex-wrap items-center gap-2">
				<span>
					{money(billing.deposit.amountCents)}, {money(billing.deposit.paidCents)} paid{#if !billing.deposit.settled},
						{money(billing.deposit.heldCents)} held{/if}
				</span>
				{#if billing.deposit.toSettle}
					<span class="badge preset-filled-warning-500">Deposit to settle</span>
				{:else if billing.deposit.settled}
					<span class="badge preset-tonal">Settled</span>
				{/if}
			</dd>
		{/if}
	</dl>

	{#if billing.deposit.settled && billing.deposit.settlement}
		<p>
			Returned {money(
				billing.deposit.settlement.returned * 100
			)}{#each billing.deposit.settlement.deductions as deduction}; kept {money(
					deduction.amount * 100
				)} for {deduction.reason}{/each}.
		</p>
	{/if}

	{#if billing.lateFees.length > 0}
		<ul class="space-y-1" aria-label="Late fees">
			{#each billing.lateFees as fee (fee.month)}
				<li class="flex flex-wrap items-center gap-2">
					<span>Late fee {fee.monthLabel}: {money(fee.amountCents)}</span>
					{#if fee.waived}
						<span class="badge preset-tonal">Waived</span>
					{:else if fee.owedCents > 0}
						<span class="badge preset-filled-error-500">Owed {money(fee.owedCents)}</span>
						<button
							type="button"
							class="btn btn-sm preset-tonal"
							disabled={busy}
							aria-label="Waive late fee for {fee.monthLabel}"
							onclick={() => waive(fee.month, fee.monthLabel)}>Waive</button
						>
					{:else}
						<span class="badge preset-tonal">Paid</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if ended && billing.deposit.paidCents > 0 && !settling}
		<button type="button" class="btn btn-sm preset-tonal" onclick={openSettlement}
			>{billing.deposit.settled ? 'Correct settlement' : 'Settle deposit'}</button
		>
	{/if}

	{#if settling}
		<form class="card preset-tonal space-y-3 p-4" onsubmit={saveSettlement} novalidate>
			<p class="font-semibold">
				Settle the {money(billing.deposit.paidCents)} deposit paid. Return the money outside the app;
				this records what was returned and kept.
			</p>
			<Field
				label="Returned to the tenants"
				errors={errors.returned ? [errors.returned] : undefined}
			>
				{#snippet children({ attrs, invalid })}
					<input
						{...attrs}
						class="input"
						class:input-error={invalid}
						type="number"
						step="0.01"
						min="0"
						bind:value={returned}
					/>
				{/snippet}
			</Field>
			<fieldset class="space-y-2">
				<legend class="label-text">Kept (deductions)</legend>
				{#each deductions, index}
					{@const problem = errors.deductions?.[index]}
					{@const problemId = `${leaseId}-deduction-${index}-error`}
					<div class="flex flex-wrap items-start gap-2">
						<label class="w-32">
							<span class="sr-only">Deduction {index + 1} amount</span>
							<input
								class="input"
								class:input-error={problem}
								aria-invalid={problem ? 'true' : undefined}
								aria-describedby={problem ? problemId : undefined}
								type="number"
								step="0.01"
								min="0"
								placeholder="Amount"
								bind:value={deductions[index].amount}
							/>
						</label>
						<label class="min-w-0 flex-auto">
							<span class="sr-only">Deduction {index + 1} reason</span>
							<input
								class="input"
								class:input-error={problem}
								aria-invalid={problem ? 'true' : undefined}
								aria-describedby={problem ? problemId : undefined}
								type="text"
								maxlength="500"
								placeholder="Reason"
								bind:value={deductions[index].reason}
							/>
						</label>
						<button
							type="button"
							class="btn-icon preset-tonal"
							aria-label="Remove deduction {index + 1}"
							onclick={() => (deductions = deductions.filter((_, i) => i !== index))}
							><IconTrash size={18} aria-hidden="true" /></button
						>
						{#if problem}<p id={problemId} class="text-error-800-200 w-full" data-field-error>
								{problem}
							</p>{/if}
					</div>
				{/each}
				<button
					type="button"
					class="btn btn-sm preset-tonal"
					onclick={() => (deductions = [...deductions, { amount: undefined, reason: '' }])}
					><IconPlus size={16} aria-hidden="true" />Add deduction</button
				>
			</fieldset>
			{#if errors.total}<Notice tone="error"><p>{errors.total}</p></Notice>{/if}
			<FormActions>
				<button type="submit" class="btn btn-sm preset-filled-primary-500" disabled={busy}
					>Save settlement</button
				>
				<button type="button" class="btn btn-sm preset-tonal" onclick={() => (settling = false)}
					>Cancel</button
				>
			</FormActions>
		</form>
	{/if}
</div>
