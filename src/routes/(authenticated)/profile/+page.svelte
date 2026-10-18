<script lang="ts">
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { profileSchema } from '$lib/schemas';
	import { getToastStore } from '$lib/ui';
	import UserAvatar from '$lib/Components/Users/UserAvatar.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import PageBody from '$lib/Components/Shell/PageBody.svelte';
	import Card from '$lib/Components/Shell/Card.svelte';
	import FormActions from '$lib/Components/Shell/FormActions.svelte';
	import Notice from '$lib/Components/Shell/Notice.svelte';
	import Field from '$lib/Components/Forms/Field.svelte';
	import { errorsAfterSubmit } from '$lib/forms/errorsAfterSubmit';
	import { formProblem } from '$lib/forms/formProblem';
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { MaskedTextChangedListener } from 'ts-input-mask';
	import { onMount } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	const toastStore = getToastStore();

	let { data }: { data: PageData } = $props();
	let phoneInput = $state<HTMLInputElement>();

	onMount(async () => {
		if (phoneInput) MaskedTextChangedListener.installOn('([000]) [000]-[0000]', phoneInput);
	});

	// svelte-ignore state_referenced_locally
	const { markSubmitted, shown: gate } = errorsAfterSubmit(data.form.posted);
	// svelte-ignore state_referenced_locally
	const {
		form,
		errors,
		message,
		enhance: enhanceContact
	} = superForm(data.form, {
		// The default reset puts back the values the page first loaded with, which are stale after a save.
		resetForm: false,
		validators: zodClient(profileSchema),
		onSubmit: () => markSubmitted(),
		onUpdated({ form: updated }) {
			if (updated.message === 'Form submitted') {
				// Display the message using a toast library
				successToast('Successfully updated user info.', toastStore);
				$form.currentPassword = '';
			}
		}
	});
	const shown = gate(errors);
	const problem = $derived(formProblem($message));

	const photoUrl = $derived(data.user.photoUrl);
	// Changing the email asks for the current password.
	const emailChanged = $derived($form.email !== data.form.data.email);

	async function handleResetPasswordClicked() {
		const response = await fetch('/api/signin/reset', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ email: data.user.email })
		});
		if (response.ok) {
			successToast('Reset email requested. Check your inbox.', toastStore);
		} else {
			errorToast('Error sending reset email.', toastStore);
		}
	}
</script>

{#snippet textField(
	label: string,
	name: 'firstName' | 'lastName' | 'email',
	type: string,
	autocomplete: HTMLInputAttributes['autocomplete']
)}
	<Field {label} errors={$shown[name]}>
		{#snippet children({ attrs, invalid })}
			<input
				{...attrs}
				{name}
				bind:value={$form[name]}
				{autocomplete}
				class="input"
				class:input-error={invalid}
				title={label}
				{type}
			/>
		{/snippet}
	</Field>
{/snippet}

<PageBody>
	<PageHeader title="Profile" />
	<div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
		<Card title="Contact Info">
			<form method="POST" action="?/contact" use:enhanceContact class="space-y-4" novalidate>
				{@render textField('First Name', 'firstName', 'text', 'given-name')}
				{@render textField('Last Name', 'lastName', 'text', 'family-name')}
				{@render textField('Email', 'email', 'email', 'email')}
				{#if emailChanged}
					<Field
						label="Current password"
						hint="(required to change your email)"
						errors={$shown.currentPassword}
					>
						{#snippet children({ attrs, invalid })}
							<input
								{...attrs}
								class:input-error={invalid}
								name="currentPassword"
								bind:value={$form.currentPassword}
								autocomplete="current-password"
								class="input"
								title="Current password"
								type="password"
							/>
						{/snippet}
					</Field>
				{/if}
				<Field label="Phone Number" errors={$shown.phoneNumber}>
					{#snippet children({ attrs, invalid })}
						<input
							{...attrs}
							bind:this={phoneInput}
							name="phoneNumber"
							bind:value={$form.phoneNumber}
							autocomplete="tel"
							class="input"
							class:input-error={invalid}
							title="Phone Number"
							type="tel"
						/>
					{/snippet}
				</Field>
				{#if problem}
					<Notice tone="error"><p>{problem}</p></Notice>
				{/if}
				<FormActions>
					<button type="submit" class="btn preset-filled-primary-500">Save</button>
				</FormActions>
			</form>
		</Card>
		<div class="flex flex-col gap-4">
			<Card title="Profile Picture">
				<form
					class="space-y-4"
					use:enhance
					method="POST"
					action="?/photo"
					enctype="multipart/form-data"
				>
					<div class="flex justify-center">
						<UserAvatar
							src={photoUrl}
							name="{data.user.firstName} {data.user.lastName}"
							class="size-32"
						/>
					</div>
					<input
						aria-label="Profile picture file"
						name="photo"
						class="input"
						type="file"
						accept="image/png, image/jpeg, image/gif, image/webp"
					/>
					<FormActions>
						<button
							type="submit"
							onclick={() => {
								invalidateAll();
							}}
							class="btn preset-filled-primary-500">Upload</button
						>
					</FormActions>
				</form>
			</Card>
			<Card title="Password">
				<FormActions>
					<button onclick={handleResetPasswordClicked} class="btn preset-filled-primary-500"
						>Reset</button
					>
				</FormActions>
			</Card>
		</div>
	</div>
</PageBody>
