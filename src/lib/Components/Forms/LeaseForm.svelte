<script lang="ts">
	import { tick } from 'svelte';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { IconCurrencyDollar, IconPlus, IconTrash } from '@tabler/icons-svelte';
	import { leaseSchema, type LeaseInput } from '$lib/schemas';
	import type { LeaseFormMessage } from '$lib/leaseTypes';
	import { defaultLateFee } from '$lib/lateFee';
	import FormActions from '$lib/Components/Shell/FormActions.svelte';
	import Notice from '$lib/Components/Shell/Notice.svelte';
	import Card from '$lib/Components/Shell/Card.svelte';
	import Field, { type FieldAttrs } from './Field.svelte';
	import { errorsAfterSubmit } from '$lib/forms/errorsAfterSubmit';

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
	const { markSubmitted, shown: gate } = errorsAfterSubmit(data.posted);
	// svelte-ignore state_referenced_locally
	const { form, errors, message, enhance, submitting } = superForm(data, {
		validators: zodClient(leaseSchema),
		// Plain form posts: the email rows go as repeated `emails` fields, next to the PDF file.
		dataType: 'form',
		taintedMessage: false,
		onSubmit: () => markSubmitted()
	});
	const shown = gate(errors);

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

{#snippet moneyInput(
	attrs: FieldAttrs,
	invalid: boolean,
	name: 'rent' | 'deposit' | 'lateFee',
	oninput?: (event: Event) => void
)}
	<div class="flex items-center gap-2">
		<IconCurrencyDollar aria-hidden="true" />
		<input
			{...attrs}
			{name}
			bind:value={$form[name]}
			{oninput}
			class="input"
			class:input-error={invalid}
			type="number"
			step="0.01"
			min="0"
		/>
	</div>
{/snippet}

{#snippet dateInput(
	attrs: FieldAttrs,
	invalid: boolean,
	name: 'startDate' | 'endDate' | 'depositDueDate'
)}
	<input
		{...attrs}
		{name}
		bind:value={$form[name]}
		class="input"
		class:input-error={invalid}
		type="date"
	/>
{/snippet}

<form
	bind:this={formElement}
	method="POST"
	use:enhance
	enctype="multipart/form-data"
	class="space-y-4"
	novalidate
>
	{#if $message?.type === 'conflicts'}
		<Notice tone="error">
			<p class="font-semibold">This lease cannot be saved:</p>
			<ul class="list-disc pl-5">
				{#each $message.problems as problem}<li>{problem.message}</li>{/each}
			</ul>
		</Notice>
	{:else if $message?.type === 'overlap'}
		<!-- Urgent: saving stopped and waits for the admin's answer. -->
		<Notice tone="warning" urgent>
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
		</Notice>
	{:else if $message?.type === 'document' || $message?.type === 'error'}
		<Notice tone="error"><p>{$message.text}</p></Notice>
	{:else if $message?.type === 'emailFailures'}
		<Notice tone="warning" urgent>
			<p class="font-semibold">The lease was saved, but these welcome emails were not sent:</p>
			<ul class="list-disc pl-5">
				{#each $message.emails as email}<li>{email}</li>{/each}
			</ul>
			<p>They can set a password with "Forgot password" on the sign-in page.</p>
			<!-- The lease is saved, so the form is gone: saving again would make a second lease. -->
			<a class="anchor" href="/admin/properties/{propertyId}/edit?tab=leases">Back to leases</a>
		</Notice>
	{/if}

	{#if $message?.type !== 'emailFailures'}
		<input type="hidden" name="confirmOverlap" value={$form.confirmOverlap ? 'true' : ''} />

		<Card as="section" title="Terms" aria-label="Terms">
			<div class="grid gap-4 md:grid-cols-3">
				<Field label="Monthly rent" errors={$shown.rent}>
					{#snippet children({ attrs, invalid })}
						{@render moneyInput(attrs, invalid, 'rent', rentChanged)}
					{/snippet}
				</Field>
				<Field label="Start date" errors={$shown.startDate}>
					{#snippet children({ attrs, invalid })}
						{@render dateInput(attrs, invalid, 'startDate')}
					{/snippet}
				</Field>
				<Field label="End date" hint="(leave empty for month to month)" errors={$shown.endDate}>
					{#snippet children({ attrs, invalid })}
						{@render dateInput(attrs, invalid, 'endDate')}
					{/snippet}
				</Field>
			</div>
		</Card>

		<Card as="section" title="Deposit and late fees" aria-label="Deposit and late fees">
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Field label="Security deposit" hint="(optional)" errors={$shown.deposit}>
					{#snippet children({ attrs, invalid })}
						{@render moneyInput(attrs, invalid, 'deposit')}
					{/snippet}
				</Field>
				<Field
					label="Deposit due"
					hint="(empty: when the lease begins)"
					errors={$shown.depositDueDate}
				>
					{#snippet children({ attrs, invalid })}
						{@render dateInput(attrs, invalid, 'depositDueDate')}
					{/snippet}
				</Field>
				<Field label="Late fee" errors={$shown.lateFee}>
					{#snippet children({ attrs, invalid })}
						{@render moneyInput(attrs, invalid, 'lateFee', () => (lateFeeEdited = true))}
					{/snippet}
				</Field>
				<Field label="Grace days" errors={$shown.graceDays}>
					{#snippet children({ attrs, invalid })}
						<input
							{...attrs}
							name="graceDays"
							bind:value={$form.graceDays}
							class="input"
							class:input-error={invalid}
							type="number"
							step="1"
							min="0"
							max="31"
						/>
					{/snippet}
				</Field>
			</div>
			<p class="text-sm opacity-80">
				The late fee is charged once for each month whose rent is not paid in full by the end of the
				grace days after it is due. Use 0 for no late fee. Partial first and last months are
				prorated by day.
			</p>
		</Card>

		<Card as="section" title="Tenants" aria-label="Tenants">
			<p class="text-sm opacity-80">
				Someone who already has an account is added to the lease. A new email gets an account and a
				welcome email.
			</p>
			{#each $form.emails, index}
				<div class="flex items-start gap-2">
					<Field
						label="Tenant email {index + 1}"
						srOnlyLabel
						class="min-w-0 flex-auto"
						errors={$shown.emails?.[index]}
					>
						{#snippet children({ attrs, invalid })}
							<input
								{...attrs}
								name="emails"
								bind:value={$form.emails[index]}
								class="input"
								class:input-error={invalid}
								type="email"
								autocomplete="off"
								placeholder="tenant@example.com"
							/>
						{/snippet}
					</Field>
					<button
						type="button"
						class="btn-icon preset-tonal"
						aria-label="Remove tenant email {index + 1}"
						onclick={() => removeEmail(index)}><IconTrash size={18} aria-hidden="true" /></button
					>
				</div>
			{/each}
			{#if $shown.emails?._errors}<p class="text-error-800-200 text-sm" data-field-error>
					{$shown.emails._errors[0]}
				</p>{/if}
			<button type="button" class="btn btn-sm preset-tonal" onclick={addEmail}
				><IconPlus size={16} aria-hidden="true" />Add tenant</button
			>
		</Card>

		<Card as="section" title="Lease document" aria-label="Lease document">
			<Field
				label="Lease document"
				hint="(PDF, up to 10 MB)"
				errors={documentError ? [documentError] : undefined}
			>
				{#snippet children({ attrs, invalid })}
					{#if documentName}
						<span class="block text-sm opacity-80"
							>Current: {documentName}. Choose a file to replace it.</span
						>
					{/if}
					<input
						{...attrs}
						name="document"
						class="input"
						class:input-error={invalid}
						type="file"
						accept="application/pdf,.pdf"
						onchange={checkDocument}
					/>
				{/snippet}
			</Field>
		</Card>

		<FormActions>
			<button type="submit" class="btn preset-filled-primary-500" disabled={$submitting}
				>Save lease</button
			>
			<a class="btn preset-tonal" href="/admin/properties/{propertyId}/edit?tab=leases">Cancel</a>
		</FormActions>
	{/if}
</form>
