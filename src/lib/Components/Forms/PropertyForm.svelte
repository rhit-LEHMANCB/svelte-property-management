<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { propertySchema, type PropertySchema } from '$lib/schemas';
	import { successToast } from '$lib/Hooks/toasts';
	import { IconCurrencyDollar } from '@tabler/icons-svelte';
	import { goto } from '$app/navigation';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { getToastStore } from '$lib/ui';
	import FormActions from '$lib/Components/Shell/FormActions.svelte';
	import Field from './Field.svelte';
	import { errorsAfterSubmit } from '$lib/forms/errorsAfterSubmit';

	const toastStore = getToastStore();

	let { data }: { data: SuperValidated<PropertySchema, string> } = $props();

	// svelte-ignore state_referenced_locally
	const { markSubmitted, shown: gate } = errorsAfterSubmit(data.posted);
	// svelte-ignore state_referenced_locally
	const { form, errors, enhance } = superForm(data, {
		validators: zodClient(propertySchema),
		onSubmit: () => markSubmitted(),
		onUpdated({ form }) {
			if (form.message === 'Form submitted') {
				// Display the message using a toast library
				successToast('Successfully added info.', toastStore);
			} else if (form.message?.startsWith('id')) {
				successToast('Successfully created property', toastStore);
				const id = form.message.slice(2);
				goto(`/admin/properties/${id}/edit`);
			}
		}
	});
	const shown = gate(errors);

	type TextName = 'title' | 'streetAddress' | 'apartmentInfo' | 'city' | 'state' | 'zip';
	type NumberName = 'bedrooms' | 'bathrooms' | 'squareFeet';
</script>

{#snippet textField(label: string, name: TextName)}
	<Field {label} errors={$shown[name]}>
		{#snippet children({ attrs, invalid })}
			<input
				{...attrs}
				{name}
				bind:value={$form[name]}
				class="input"
				class:input-error={invalid}
				title={label}
				type="text"
			/>
		{/snippet}
	</Field>
{/snippet}

{#snippet numberField(label: string, name: NumberName, step?: string)}
	<Field {label} errors={$shown[name]}>
		{#snippet children({ attrs, invalid })}
			<input
				{...attrs}
				{name}
				bind:value={$form[name]}
				class="input"
				class:input-error={invalid}
				title={label}
				type="number"
				{step}
			/>
		{/snippet}
	</Field>
{/snippet}

<form method="POST" action="?/basicInfo" use:enhance class="space-y-4" novalidate>
	<h2 class="h4">Basic Info</h2>
	<div class="grid gap-4 sm:grid-cols-2">
		{@render textField('Title', 'title')}
		<Field label="Rent" errors={$shown.rent}>
			{#snippet children({ attrs, invalid })}
				<div class="flex items-center gap-2">
					<IconCurrencyDollar aria-hidden="true" />
					<input
						{...attrs}
						name="rent"
						bind:value={$form.rent}
						class="input"
						class:input-error={invalid}
						title="Rent"
						type="number"
					/>
				</div>
			{/snippet}
		</Field>
	</div>
	<Field label="Description" errors={$shown.description}>
		{#snippet children({ attrs, invalid })}
			<textarea
				{...attrs}
				name="description"
				bind:value={$form.description}
				rows="4"
				class="textarea"
				class:input-error={invalid}
				title="Description"></textarea>
		{/snippet}
	</Field>
	<div class="grid gap-4 sm:grid-cols-3">
		{@render numberField('Bedrooms', 'bedrooms')}
		{@render numberField('Bathrooms', 'bathrooms', '0.5')}
		{@render numberField('Square Feet', 'squareFeet')}
	</div>
	<h2 class="h4">Address</h2>
	<div class="grid gap-4 md:grid-cols-2">
		{@render textField('Street Address', 'streetAddress')}
		{@render textField('Apartment Info', 'apartmentInfo')}
	</div>
	<div class="grid gap-4 md:grid-cols-2">
		{@render textField('City', 'city')}
		<div class="grid grid-cols-2 gap-4">
			{@render textField('State', 'state')}
			{@render textField('Zip Code', 'zip')}
		</div>
	</div>
	<FormActions>
		<button type="submit" class="btn preset-filled-primary-500">Save</button>
	</FormActions>
</form>
