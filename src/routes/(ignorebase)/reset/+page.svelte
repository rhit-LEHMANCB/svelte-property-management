<script lang="ts">
	import { errorToast } from '$lib/Hooks/toasts';
	import { auth } from '$lib/firebase';
	import { getModalStore, getToastStore, type ModalSettings } from '$lib/ui';
	import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { passwordChangeSchema } from '$lib/schemas';
	import { errorsAfterSubmit } from '$lib/forms/errorsAfterSubmit';
	import AuthCard from '$lib/Components/Shell/AuthCard.svelte';
	import FormActions from '$lib/Components/Shell/FormActions.svelte';
	import Field from '$lib/Components/Forms/Field.svelte';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const { markSubmitted, shown: gate } = errorsAfterSubmit(data.form.posted);
	// svelte-ignore state_referenced_locally
	const { form, errors, validateForm } = superForm(data.form, {
		validators: zodClient(passwordChangeSchema),
		// Never ask "Leave site?": the form is done with once the password has changed.
		taintedMessage: false
	});
	const shown = gate(errors);

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// The server load has already rejected links without a code or with another mode.
	// svelte-ignore state_referenced_locally
	const actionCode = data.oobCode;

	let submitting = false;

	async function handleVerifyPasswordReset(event: Event) {
		// Before anything else, so a submit before hydration never posts the passwords.
		event.preventDefault();
		if (submitting) return;
		submitting = true;
		markSubmitted();

		const result = await validateForm({ update: true });

		if (!result.valid) {
			submitting = false;
			return;
		}

		verifyPasswordResetCode(auth, actionCode)
			.then(() => {
				const newPassword = $form.newPassword;

				// Save the new password.
				confirmPasswordReset(auth, actionCode, newPassword)
					.then(() => {
						const modal: ModalSettings = {
							type: 'alert',
							title: 'Success!',
							body: 'Your password was reset successfully. Press continue to proceed.',
							buttonTextCancel: 'Continue',
							// Always to sign-in on this site: the link's continueUrl is not trusted.
							response: () => window.location.assign('/signin?reset=success')
						};
						modalStore.trigger(modal);
					})
					.catch(() => {
						submitting = false;
						errorToast('Error resetting password. Please try again.', toastStore);
					});
			})
			.catch(() => {
				submitting = false;
				errorToast('Error resetting password. Please try again.', toastStore);
			});
	}
</script>

<div class="flex h-full items-center justify-center overflow-y-auto p-4">
	<AuthCard>
		<form method="POST" onsubmit={handleVerifyPasswordReset} class="space-y-4" novalidate>
			<div>
				<h1 class="h3">Lehman Family LLC</h1>
				<p class="opacity-80">Please fill out the information below to create your new password.</p>
			</div>
			<Field label="New Password" errors={$shown.newPassword} describedBy="password-rules">
				{#snippet children({ attrs, invalid })}
					<input
						{...attrs}
						name="newPassword"
						bind:value={$form.newPassword}
						class="input"
						class:input-error={invalid}
						title="New Password"
						type="password"
						autocomplete="new-password"
					/>
				{/snippet}
			</Field>
			<ul id="password-rules" class="list-inside list-disc text-sm opacity-80">
				<li>At least 8 characters</li>
				<li>Less than 32 characters</li>
				<li>One uppercase letter</li>
				<li>One lowercase letter</li>
				<li>A number or special character</li>
			</ul>
			<Field label="Verify Password" errors={$shown.verifyPassword}>
				{#snippet children({ attrs, invalid })}
					<input
						{...attrs}
						name="verifyPassword"
						bind:value={$form.verifyPassword}
						class="input"
						class:input-error={invalid}
						title="Verify Password"
						type="password"
						autocomplete="new-password"
					/>
				{/snippet}
			</Field>
			<FormActions>
				<button type="submit" data-needs-hydration class="btn preset-filled-primary-500 w-full"
					>Change Password</button
				>
			</FormActions>
		</form>
	</AuthCard>
</div>
