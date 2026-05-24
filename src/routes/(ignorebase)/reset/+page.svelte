<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { errorToast } from '$lib/Hooks/toasts';
	import { auth } from '$lib/firebase';
	import { Popover, Modal } from '@skeletonlabs/skeleton-svelte';
	import { error } from '@sveltejs/kit';
	import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms/client';
	import { passwordChangeSchema } from '$lib/schemas';
	import { IconQuestionMark } from '@tabler/icons-svelte';
	import { PUBLIC_FRONTEND_URL } from '$env/static/public';
	import { get } from 'svelte/store';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const { form, errors, validate, enhance } = superForm(data.form, {
		customValidity: true,
		validators: passwordChangeSchema,
		validationMethod: 'onblur'
	});

	let popupOpen = $state(false);
	let successModalOpen = $state(false);

	const currentPage = get(page);
	const mode = currentPage.url.searchParams.get('mode');
	const actionCode = currentPage.url.searchParams.get('oobCode');
	const continueUrl = currentPage.url.searchParams.get('continueUrl');

	if (mode !== 'resetPassword') {
		throw error(400, 'Invalid action');
	}

	function handleSuccess() {
		goto(continueUrl ?? `${PUBLIC_FRONTEND_URL}/`);
	}

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
						successModalOpen = true;
					})
					.catch(() => {
						errorToast('Error resetting password. Please try again.');
					});
			})
			.catch(() => {
				errorToast('Error resetting password. Please try again.');
			});
	}
</script>

{#snippet popoverTrigger()}
	<button
		class="badge-icon preset-outlined-primary-500 [&>*]:pointer-events-none"
		onclick={() => (popupOpen = !popupOpen)}
	>
		<IconQuestionMark />
	</button>
{/snippet}

{#snippet popoverContent()}
	<div class="card p-4 preset-filled-primary-500 w-64">
		<ul>
			<li>- At least 8 characters</li>
			<li>- Less than 32 characters</li>
			<li>- One uppercase letter</li>
			<li>- One lowercase letter</li>
			<li>- A number or special character</li>
		</ul>
	</div>
{/snippet}

{#snippet successModalContent()}
	<div class="card p-4 space-y-4 w-[400px] max-w-[90vw]">
		<header class="text-xl font-bold">Success!</header>
		<p>Your password was reset successfully. Press continue to proceed.</p>
		<footer class="flex justify-end">
			<button type="button" class="btn preset-filled-primary-500" onclick={handleSuccess}>
				Continue
			</button>
		</footer>
	</div>
{/snippet}

<div class="h-screen flex items-center justify-center">
	<div class="card p-3">
		<form use:enhance class="h-auto m-5">
			<strong class="h3">Lehman Family Realty</strong>
			<p>Please fill out the information below<br /> to create your new password.</p>
			<div class="grid grid-rows-2 gap-2 mt-2">
				<div>
					<label class="label">
						<div class="flex flex-row gap-2">
							<span>New Password</span>
							<Popover open={popupOpen} onOpenChange={(details) => (popupOpen = details.open)}>
								{#snippet trigger()}{@render popoverTrigger()}{/snippet}
								{#snippet content()}{@render popoverContent()}{/snippet}
							</Popover>
						</div>
						<input
							name="newPassword"
							bind:value={$form.newPassword}
							class="input"
							class:input-error={$errors.newPassword}
							title="New Password"
							type="password"
						/>
					</label>
				</div>
				<div>
					<label class="label">
						<span>Verify Password</span>
						<input
							name="verifyPassword"
							bind:value={$form.verifyPassword}
							class="input"
							class:input-error={$errors.verifyPassword}
							title="Verify Password"
							type="password"
						/>
					</label>
				</div>
			</div>
			<button
				onclick={(event) => handleVerifyPasswordReset(event)}
				class="btn preset-filled-primary-500 mt-5">Change Password</button
			>
		</form>
	</div>
</div>

{#if successModalOpen}
	<Modal
		open={successModalOpen}
		onOpenChange={(details) => (successModalOpen = details.open)}
		content={successModalContent}
	/>
{/if}
