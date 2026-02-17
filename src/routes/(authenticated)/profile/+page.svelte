<script lang="ts">
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { profileSchema } from '$lib/schemas';
	import { Avatar, getToastStore } from '@skeletonlabs/skeleton';
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms/client';
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
		validators: profileSchema,
		onUpdated({ form }) {
			if (form.message === 'Form submitted') {
				// Display the message using a toast library
				successToast('Successfully updated user info.', toastStore);
			}
		}
	});

	$: photoUrl = data.user.photoUrl;

	async function handleResetPasswordClicked() {
		const response = await fetch('/api/signin/reset', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ email: data.user.email })
		});
		if (response.ok) {
			successToast('Reset email successfully sent.', toastStore);
		} else {
			errorToast('Error sending reset email.', toastStore);
		}
	}
</script>

<div class="grid grid-cols-1 md:grid-cols-2 m-5 gap-2">
	<div class="flex flex-col gap-2">
		<div class="card">
			<form method="POST" action="?/contact" use:enhanceContact class="h-auto m-5">
				<strong class="h3">Contact Info</strong>
				<div class="grid grid-rows-4 grid-flow-col gap-2 mt-2">
					<div>
						<label class="label"
							><span>First Name</span><input
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
							><span>Last Name</span><input
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
							><span>Email</span><input
								name="email"
								bind:value={$form.email}
								class="input"
								class:input-error={$errors.email}
								title="Email"
								type="email"
							/></label
						>
					</div>
					<div>
						<label class="label"
							><span>Phone Number</span><input
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
				<button type="submit" class="btn variant-filled-secondary mt-5">Save</button>
			</form>
		</div>
	</div>
	<div class="flex flex-col gap-2">
		<div class="card">
			<form
				class="h-auto m-5"
				use:enhance
				method="POST"
				action="?/photo"
				enctype="multipart/form-data"
			>
				<strong class="h3">Profile Picture</strong>
				<div class="flex flex-col gap-5">
					<Avatar
						src={photoUrl}
						initials={`${data.user.firstName[0]}${data.user.lastName[0]}`}
						width="w-32"
						class="self-center"
					/>
					<div class="flex flex-row gap-2">
						<input
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
							class="btn btn-sm variant-filled-secondary">Upload</button
						>
					</div>
				</div>
			</form>
		</div>
		<div class="card">
			<div class="h-auto m-5">
				<strong class="h3">Password</strong>
				<div>
					<button on:click={handleResetPasswordClicked} class="btn variant-filled-secondary mt-5"
						>Reset</button
					>
				</div>
			</div>
		</div>
	</div>
</div>
