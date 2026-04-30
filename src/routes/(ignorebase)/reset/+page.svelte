<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { errorToast } from '$lib/Hooks/toasts';
	import { auth } from '$lib/firebase';
	import {
		getDialogStore,
		getToastStore,
		popup,
		type DialogSettings,
		type PopupSettings
	} from '@skeletonlabs/skeleton-svelte';
	import { error } from '@sveltejs/kit';
	import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms/client';
	import { passwordChangeSchema } from '$lib/schemas';
	import { IconQuestionMark } from '@tabler/icons-svelte';
	import { PUBLIC_FRONTEND_URL } from '$env/static/public';

	export let data: PageData;

	const { form, errors, validate, enhance } = superForm(data.form, {
		customValidity: true,
		validators: passwordChangeSchema,
		validationMethod: 'onblur'
	});

	const toastStore = getToastStore();
	const dialogStore = getDialogStore();

	const mode = $page.url.searchParams.get('mode');

	const actionCode = $page.url.searchParams.get('oobCode');

	const continueUrl = $page.url.searchParams.get('continueUrl');

	if (mode !== 'resetPassword') {
		throw error(400, 'Invalid action');
	}

	const popupHover: PopupSettings = {
		event: 'hover',
		target: 'popupHover',
		placement: 'top'
	};

	async function handleVerifyPasswordReset(event: Event) {
		event.preventDefault();

		if (!actionCode) {
			throw error(400, 'Invalid action');
		}

		const result = await validate();

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
						const modal: DialogSettings = {
							type: 'alert',
							// Data
							title: 'Success!',
							body: 'Your password was reset successfully. Press continue to proceed.',
							buttonTextCancel: 'Continue',
							// TRUE if confirm pressed, FALSE if cancel pressed
							response: () => goto(continueUrl ?? `${PUBLIC_FRONTEND_URL}/`)
						};
						dialogStore.trigger(modal);
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

<div class="h-screen flex items-center justify-center">
	<div class="card p-3">
		<form use:enhance class="h-auto m-5">
			<strong class="h3">Lehman Family Realty</strong>
			<p>Please fill out the information below<br /> to create your new password.</p>
			<div class="grid grid-rows-2 gap-2 mt-2">
				<div>
					<label class="label"
						><div class="flex flex-row gap-2">
							<span>New Password</span><button
								class="badge-icon variant-outline-primary [&>*]:pointer-events-none"
								use:popup={popupHover}><IconQuestionMark /></button
							>
							<div class="card p-4 variant-filled-primary w-64" data-popup="popupHover">
								<ul>
									<li>- At least 8 characters</li>
									<li>- Less than 32 characters</li>
									<li>- One uppercase letter</li>
									<li>- One lowercase letter</li>
									<li>- A number or special character</li>
								</ul>
								<div class="arrow variant-filled-primary" />
							</div>
						</div>
						<input
							name="newPassword"
							bind:value={$form.newPassword}
							class="input"
							class:input-error={$errors.newPassword}
							title="New Password"
							type="password"
						/></label
					>
				</div>
				<div>
					<label class="label"
						><span>Verify Password</span><input
							name="verifyPassword"
							bind:value={$form.verifyPassword}
							class="input"
							class:input-error={$errors.verifyPassword}
							title="Verify Password"
							type="password"
						/></label
					>
				</div>
			</div>
			<button
				on:click={(event) => handleVerifyPasswordReset(event)}
				class="btn variant-filled-primary mt-5">Change Password</button
			>
		</form>
	</div>
</div>
