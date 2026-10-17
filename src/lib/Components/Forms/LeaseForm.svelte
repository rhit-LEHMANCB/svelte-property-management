<script lang="ts">
	import { tick } from 'svelte';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { IconCurrencyDollar, IconPlus, IconTrash } from '@tabler/icons-svelte';
	import { leaseSchema, type LeaseInput } from '$lib/schemas';
	import type { LeaseFormMessage } from '$lib/leaseTypes';
	import { defaultLateFee } from '$lib/lateFee';

	let {
		data,
		propertyId,
		documentName = null,
		lateFeeFollowsRent = false
	}: {
		data: SuperValidated<LeaseInput, LeaseFormMessage>;
		propertyId: string;
		documentName?: string | null;
		/** On a new lease, the late fee tracks 5% of the rent until the admin edits it. */
		lateFeeFollowsRent?: boolean;
	} = $props();

	const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

	// svelte-ignore state_referenced_locally
	const { form, errors, message, enhance, submitting } = superForm(data, {
		validators: zodClient(leaseSchema),
		// Plain form posts: the email rows go as repeated `emails` fields, next to the PDF file.
		dataType: 'form',
		taintedMessage: false
	});

	let formElement = $state<HTMLFormElement>();
	let documentError = $state('');

	function addEmail() {
		$form.emails = [...$form.emails, ''];
	}

	function removeEmail(index: number) {
		$form.emails = $form.emails.filter((_, i) => i !== index);
		if ($form.emails.length === 0) $form.emails = [''];
	}

	function checkDocument(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		documentError = '';
		if (file && file.size > MAX_DOCUMENT_BYTES) {
			documentError = 'The lease document must be 10 MB or smaller.';
			input.value = '';
		}
	}

	// svelte-ignore state_referenced_locally
	let lateFeeEdited = !lateFeeFollowsRent;
	function rentChanged(event: Event) {
		const rent = (event.currentTarget as HTMLInputElement).valueAsNumber;
		if (!lateFeeEdited && Number.isFinite(rent) && rent > 0) $form.lateFee = defaultLateFee(rent);
	}

	async function saveAnyway() {
		$form.confirmOverlap = true;
		await tick();
		formElement?.requestSubmit();
	}

	// "Save anyway" answers one warning only: once the server replies with anything else, the next
	// save is checked for overlaps again.
	$effect(() => {
		if ($message?.type !== 'overlap') $form.confirmOverlap = false;
	});
</script>

<form
	bind:this={formElement}
	method="POST"
	use:enhance
	enctype="multipart/form-data"
	class="flex flex-col gap-4"
	novalidate
>
	{#if $message?.type === 'conflicts'}
		<div class="card preset-tonal-error p-4" role="alert">
			<p class="font-semibold">This lease cannot be saved:</p>
			<ul class="list-disc pl-5">
				{#each $message.problems as problem}<li>{problem.message}</li>{/each}
			</ul>
		</div>
	{:else if $message?.type === 'overlap'}
		<div class="card preset-tonal-warning space-y-3 p-4" role="alert">
			<p class="font-semibold">These dates overlap another lease at this property:</p>
			<ul class="list-disc pl-5">
				{#each $message.overlapping as other}
					<li>
						{other.startDate} to {other.endDate ?? 'month to month'}{other.tenantNames.length
							? `: ${other.tenantNames.join(', ')}`
							: ''}
					</li>
				{/each}
			</ul>
			<button
				type="button"
				class="btn preset-filled-warning-500"
				onclick={saveAnyway}
				disabled={$submitting}>Save anyway</button
			>
		</div>
	{:else if $message?.type === 'document' || $message?.type === 'error'}
		<div class="card preset-tonal-error p-4" role="alert">{$message.text}</div>
	{:else if $message?.type === 'emailFailures'}
		<div class="card preset-tonal-warning space-y-2 p-4" role="alert">
			<p class="font-semibold">The lease was saved, but these welcome emails were not sent:</p>
			<ul class="list-disc pl-5">
				{#each $message.emails as email}<li>{email}</li>{/each}
			</ul>
			<p>They can set a password with "Forgot password" on the sign-in page.</p>
			<!-- The lease is saved, so the form is gone: saving again would make a second lease. -->
			<a class="anchor" href="/admin/properties/{propertyId}/edit?tab=leases">Back to leases</a>
		</div>
	{/if}

	{#if $message?.type !== 'emailFailures'}
		<input type="hidden" name="confirmOverlap" value={$form.confirmOverlap ? 'true' : ''} />

		<div class="grid gap-4 md:grid-cols-3">
			<label class="label">
				<span>Monthly rent</span>
				<div class="flex items-center gap-2">
					<IconCurrencyDollar aria-hidden="true" />
					<input
						name="rent"
						bind:value={$form.rent}
						oninput={rentChanged}
						class="input"
						class:input-error={$errors.rent}
						aria-invalid={$errors.rent ? 'true' : undefined}
						type="number"
						step="0.01"
						min="0"
					/>
				</div>
				{#if $errors.rent}<span class="text-error-600-400 text-sm">{$errors.rent[0]}</span>{/if}
			</label>
			<label class="label">
				<span>Start date</span>
				<input
					name="startDate"
					bind:value={$form.startDate}
					class="input"
					class:input-error={$errors.startDate}
					aria-invalid={$errors.startDate ? 'true' : undefined}
					type="date"
				/>
				{#if $errors.startDate}<span class="text-error-600-400 text-sm">{$errors.startDate[0]}</span
					>{/if}
			</label>
			<label class="label">
				<span>End date <span class="opacity-70">(leave empty for month to month)</span></span>
				<input
					name="endDate"
					bind:value={$form.endDate}
					class="input"
					class:input-error={$errors.endDate}
					aria-invalid={$errors.endDate ? 'true' : undefined}
					type="date"
				/>
				{#if $errors.endDate}<span class="text-error-600-400 text-sm">{$errors.endDate[0]}</span
					>{/if}
			</label>
		</div>

		<fieldset class="space-y-2">
			<legend class="label-text">Deposit and late fees</legend>
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<label class="label">
					<span>Security deposit <span class="opacity-70">(optional)</span></span>
					<div class="flex items-center gap-2">
						<IconCurrencyDollar aria-hidden="true" />
						<input
							name="deposit"
							bind:value={$form.deposit}
							class="input"
							class:input-error={$errors.deposit}
							aria-invalid={$errors.deposit ? 'true' : undefined}
							type="number"
							step="0.01"
							min="0"
						/>
					</div>
					{#if $errors.deposit}<span class="text-error-600-400 text-sm">{$errors.deposit[0]}</span
						>{/if}
				</label>
				<label class="label">
					<span>Deposit due <span class="opacity-70">(empty: when the lease begins)</span></span>
					<input
						name="depositDueDate"
						bind:value={$form.depositDueDate}
						class="input"
						class:input-error={$errors.depositDueDate}
						aria-invalid={$errors.depositDueDate ? 'true' : undefined}
						type="date"
					/>
					{#if $errors.depositDueDate}<span class="text-error-600-400 text-sm"
							>{$errors.depositDueDate[0]}</span
						>{/if}
				</label>
				<label class="label">
					<span>Late fee</span>
					<div class="flex items-center gap-2">
						<IconCurrencyDollar aria-hidden="true" />
						<input
							name="lateFee"
							bind:value={$form.lateFee}
							oninput={() => (lateFeeEdited = true)}
							class="input"
							class:input-error={$errors.lateFee}
							aria-invalid={$errors.lateFee ? 'true' : undefined}
							type="number"
							step="0.01"
							min="0"
						/>
					</div>
					{#if $errors.lateFee}<span class="text-error-600-400 text-sm">{$errors.lateFee[0]}</span
						>{/if}
				</label>
				<label class="label">
					<span>Grace days</span>
					<input
						name="graceDays"
						bind:value={$form.graceDays}
						class="input"
						class:input-error={$errors.graceDays}
						aria-invalid={$errors.graceDays ? 'true' : undefined}
						type="number"
						step="1"
						min="0"
						max="31"
					/>
					{#if $errors.graceDays}<span class="text-error-600-400 text-sm"
							>{$errors.graceDays[0]}</span
						>{/if}
				</label>
			</div>
			<p class="text-sm opacity-80">
				The late fee is charged once for each month whose rent is not paid in full by the end of the
				grace days after it is due. Use 0 for no late fee. Partial first and last months are
				prorated by day.
			</p>
		</fieldset>

		<fieldset class="space-y-2">
			<legend class="label-text">Tenant emails</legend>
			<p class="text-sm opacity-80">
				Someone who already has an account is added to the lease. A new email gets an account and a
				welcome email.
			</p>
			{#each $form.emails, index}
				<div class="flex items-start gap-2">
					<label class="min-w-0 flex-auto">
						<span class="sr-only">Tenant email {index + 1}</span>
						<input
							name="emails"
							bind:value={$form.emails[index]}
							class="input"
							class:input-error={$errors.emails?.[index]}
							aria-invalid={$errors.emails?.[index] ? 'true' : undefined}
							type="email"
							autocomplete="off"
							placeholder="tenant@example.com"
						/>
						{#if $errors.emails?.[index]}<span class="text-error-600-400 text-sm"
								>{$errors.emails[index]?.[0]}</span
							>{/if}
					</label>
					<button
						type="button"
						class="btn-icon preset-tonal"
						aria-label="Remove tenant email {index + 1}"
						onclick={() => removeEmail(index)}><IconTrash size={18} aria-hidden="true" /></button
					>
				</div>
			{/each}
			{#if $errors.emails?._errors}<p class="text-error-600-400 text-sm">
					{$errors.emails._errors[0]}
				</p>{/if}
			<button type="button" class="btn btn-sm preset-tonal" onclick={addEmail}
				><IconPlus size={16} aria-hidden="true" />Add tenant</button
			>
		</fieldset>

		<label class="label">
			<span>Lease document (PDF, up to 10 MB)</span>
			{#if documentName}
				<span class="text-sm opacity-80">Current: {documentName}. Choose a file to replace it.</span
				>
			{/if}
			<input
				name="document"
				class="input"
				type="file"
				accept="application/pdf,.pdf"
				onchange={checkDocument}
			/>
			{#if documentError}<span class="text-error-600-400 text-sm">{documentError}</span>{/if}
		</label>

		<div class="flex gap-3">
			<button type="submit" class="btn preset-filled-primary-500" disabled={$submitting}
				>Save lease</button
			>
			<a class="btn preset-tonal" href="/admin/properties/{propertyId}/edit?tab=leases">Cancel</a>
		</div>
	{/if}
</form>
