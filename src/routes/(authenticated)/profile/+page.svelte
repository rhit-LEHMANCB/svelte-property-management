<script lang="ts">
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { profileSchema } from '$lib/schemas';
	import { getToastStore } from '$lib/ui';
	import UserAvatar from '$lib/Components/Users/UserAvatar.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { MaskedTextChangedListener } from 'ts-input-mask';
	import { onMount } from 'svelte';

	const toastStore = getToastStore();

	export let data: PageData;
	let phoneInput: HTMLInputElement;

	onMount(async () => {
		MaskedTextChangedListener.installOn('([000]) [000]-[0000]', phoneInput);
	});

	const {
		form,
		errors,
		enhance: enhanceContact
	} = superForm(data.form, {
		customValidity: true,
		validators: zodClient(profileSchema),
		onUpdated({ form: updated }) {
			if (updated.message === 'Form submitted') {
				// Display the message using a toast library
				successToast('Successfully updated user info.', toastStore);
				$form.currentPassword = '';
			} else if (updated.message) {
				errorToast(updated.message, toastStore);
			}
		}
	});

	$: photoUrl = data.user.photoUrl;
	// Changing the email asks for the current password.
	$: emailChanged = $form.email !== data.form.data.email;

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

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title="Profile" />
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<div class="flex flex-col gap-2">
			<div class="card bg-surface-100-900">
				<form method="POST" action="?/contact" use:enhanceContact class="p-4 sm:p-6">
					<h2 class="h4">Contact Info</h2>
					<div class="mt-3 grid gap-3">
						<div>
							<label class="label"
								><span class="label-text">First Name</span><input
									name="firstName"
									bind:value={$form.firstName}
									class="input"
									class:input-error={$errors.firstName}
									title="First Name"
									type="text"
								/></label
							>
						</div>
						<div>
							<label class="label"
								><span class="label-text">Last Name</span><input
									name="lastName"
									bind:value={$form.lastName}
									class="input"
									class:input-error={$errors.lastName}
									title="Last Name"
									type="text"
								/></label
							>
						</div>
						<div>
							<label class="label"
								><span class="label-text">Email</span><input
									name="email"
									bind:value={$form.email}
									class="input"
									class:input-error={$errors.email}
									title="Email"
									type="email"
								/></label
							>
						</div>
						{#if emailChanged}
							<div>
								<label class="label"
									><span class="label-text">Current password (required to change your email)</span
									><input
										name="currentPassword"
										bind:value={$form.currentPassword}
										autocomplete="current-password"
										class="input"
										title="Current password"
										type="password"
									/></label
								>
							</div>
						{/if}
						<div>
							<label class="label"
								><span class="label-text">Phone Number</span><input
									bind:this={phoneInput}
									name="phoneNumber"
									bind:value={$form.phoneNumber}
									class="input"
									class:input-error={$errors.phoneNumber}
									title="Phone Number"
									type="tel"
								/></label
							>
						</div>
					</div>
					<button type="submit" class="btn preset-filled-primary-500 mt-5">Save</button>
				</form>
			</div>
		</div>
		<div class="flex flex-col gap-2">
			<div class="card bg-surface-100-900">
				<form
					class="p-4 sm:p-6"
					use:enhance
					method="POST"
					action="?/photo"
					enctype="multipart/form-data"
				>
					<h2 class="h4">Profile Picture</h2>
					<div class="flex flex-col gap-5">
						<div class="self-center">
							<UserAvatar
								src={photoUrl}
								name="{data.user.firstName} {data.user.lastName}"
								class="size-32"
							/>
						</div>
						<div class="flex flex-row flex-wrap gap-2">
							<input
								aria-label="Profile picture file"
								name="photo"
								class="input"
								type="file"
								accept="image/png, image/jpeg, image/gif, image/webp"
							/>
							<button
								type="submit"
								on:click={() => {
									invalidateAll();
								}}
								class="btn preset-filled-primary-500">Upload</button
							>
						</div>
					</div>
				</form>
			</div>
			<div class="card bg-surface-100-900">
				<div class="p-4 sm:p-6">
					<h2 class="h4">Password</h2>
					<div>
						<button on:click={handleResetPasswordClicked} class="btn preset-filled-primary-500 mt-5"
							>Reset</button
						>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
