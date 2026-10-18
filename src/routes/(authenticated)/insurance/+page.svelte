<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import type { PageData } from './$types';
	import { insuranceSchema } from '$lib/schemas';
	import { successToast } from '$lib/Hooks/toasts';
	import { getToastStore } from '$lib/ui';
	import DateInput from '$lib/DatePicker/DateInput.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import PageBody from '$lib/Components/Shell/PageBody.svelte';
	import Card from '$lib/Components/Shell/Card.svelte';
	import FormActions from '$lib/Components/Shell/FormActions.svelte';
	import Field from '$lib/Components/Forms/Field.svelte';
	import { errorsAfterSubmit } from '$lib/forms/errorsAfterSubmit';

	let { data }: { data: PageData } = $props();
	const toastStore = getToastStore();

	// svelte-ignore state_referenced_locally
	const { markSubmitted, shown: gate } = errorsAfterSubmit(data.form.posted);
	// svelte-ignore state_referenced_locally
	const { form, errors, enhance } = superForm(data.form, {
		validators: zodClient(insuranceSchema),
		onSubmit: () => markSubmitted(),
		onUpdated({ form }) {
			if (form.message === 'Form submitted') {
				// Display the message using a toast library
				successToast('Successfully updated user info.', toastStore);
			}
		}
	});
	const shown = gate(errors);
</script>

<PageBody>
	<PageHeader title="Insurance" />
	<Card title="Renters insurance">
		<form method="POST" use:enhance class="space-y-4" novalidate>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field label="Insurance Company Name" errors={$shown.companyName}>
					{#snippet children({ attrs, invalid })}
						<input
							{...attrs}
							name="companyName"
							bind:value={$form.companyName}
							class="input"
							class:input-error={invalid}
							title="Insurance Company Name"
							type="text"
						/>
					{/snippet}
				</Field>
				<Field label="Policy Number" errors={$shown.policyNumber}>
					{#snippet children({ attrs, invalid })}
						<input
							{...attrs}
							name="policyNumber"
							bind:value={$form.policyNumber}
							class="input"
							class:input-error={invalid}
							title="Policy Number"
							type="text"
						/>
					{/snippet}
				</Field>
				<Field label="Start Date" errors={$shown.startDate}>
					{#snippet children({ attrs, invalid })}
						<DateInput
							{...attrs}
							bind:value={$form.startDate}
							name="startDate"
							title="Start Date"
							{invalid}
						/>
					{/snippet}
				</Field>
				<Field label="End Date" errors={$shown.endDate}>
					{#snippet children({ attrs, invalid })}
						<DateInput
							{...attrs}
							bind:value={$form.endDate}
							name="endDate"
							title="End Date"
							{invalid}
						/>
					{/snippet}
				</Field>
			</div>
			<FormActions>
				<button type="submit" class="btn preset-filled-primary-500">Save</button>
			</FormActions>
		</form>
	</Card>
</PageBody>
