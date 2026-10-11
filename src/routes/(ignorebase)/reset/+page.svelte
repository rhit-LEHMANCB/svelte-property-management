<script lang="ts">
	import { page } from '$app/stores';
	import { errorToast } from '$lib/Hooks/toasts';
	import { auth } from '$lib/firebase';
	import { getModalStore, getToastStore, type ModalSettings } from '$lib/ui';
	import { error } from '@sveltejs/kit';
	import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { passwordChangeSchema } from '$lib/schemas';
	import { PUBLIC_FRONTEND_URL } from '$env/static/public';

	export let data: PageData;

	const { form, errors, validateForm, enhance } = superForm(data.form, {
		customValidity: true,
		validators: zodClient(passwordChangeSchema),
		validationMethod: 'onblur'
	});

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	const mode = $page.url.searchParams.get('mode');

	const actionCode = $page.url.searchParams.get('oobCode');

	const continueUrl = $page.url.searchParams.get('continueUrl');

	if (mode !== 'resetPassword') {
		throw error(400, 'Invalid action');
	}

	async function handleVerifyPasswordReset(event: Event) {
		event.preventDefault();

		if (!actionCode) {
			throw error(400, 'Invalid action');
		}

		const result = await validateForm({ update: true });

		if (!result.valid) {
			return;
		}

		verifyPasswordResetCode(auth, actionCode)
			.then(() => {
				const newPassword = $form.newPassword;

				// Save the new password.
				confirmPasswordReset(auth, actionCode, newPassword)
					.then(() => {
						// Password reset has been confirmed and new password updated.
						const modal: ModalSettings = {
							type: 'alert',
							// Data
							title: 'Success!',
							body: 'Your password was reset successfully. Press continue to proceed.',
							buttonTextCancel: 'Continue',
							// TRUE if confirm pressed, FALSE if cancel pressed
							response: () => window.location.assign(continueUrl ?? `${PUBLIC_FRONTEND_URL}/`)
						};
						modalStore.trigger(modal);
						// TODO: create a modal that confirms success and then on confirm sends user to login page
					})
					.catch(() => {
						errorToast('Error resetting password. Please try again.', toastStore);
					});
			})
			.catch(() => {
				errorToast('Error resetting password. Please try again.', toastStore);
			});
	}
</script>

<div class="flex h-full items-center justify-center overflow-y-auto p-4">
	<form use:enhance class="card bg-surface-100-900 w-full max-w-md space-y-4 p-6 shadow-xl">
		<h1 class="h3">Lehman Family LLC</h1>
		<p>Please fill out the information below to create your new password.</p>
		<label class="label"
			><span class="label-text">New Password</span>
			<input
				name="newPassword"
				bind:value={$form.newPassword}
				class="input"
				class:input-error={$errors.newPassword}
				title="New Password"
				type="password"
				autocomplete="new-password"
				aria-describedby="password-rules"
			/></label
		>
		<ul id="password-rules" class="list-inside list-disc text-sm opacity-80">
			<li>At least 8 characters</li>
			<li>Less than 32 characters</li>
			<li>One uppercase letter</li>
			<li>One lowercase letter</li>
			<li>A number or special character</li>
		</ul>
		<label class="label"
			><span class="label-text">Verify Password</span><input
				name="verifyPassword"
				bind:value={$form.verifyPassword}
				class="input"
				class:input-error={$errors.verifyPassword}
				title="Verify Password"
				type="password"
				autocomplete="new-password"
			/></label
		>
		<button
			data-needs-hydration
			on:click={(event) => handleVerifyPasswordReset(event)}
			class="btn preset-filled-primary-500 w-full">Change Password</button
		>
	</form>
</div>
