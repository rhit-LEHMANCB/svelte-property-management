<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { propertySchema, type PropertySchema } from '$lib/schemas';
	import { successToast } from '$lib/Hooks/toasts';
	import { IconCurrencyDollar } from '@tabler/icons-svelte';
	import { goto } from '$app/navigation';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { getToastStore } from '$lib/ui';

	const toastStore = getToastStore();

	export let data: SuperValidated<PropertySchema, string>;

	const { form, errors, enhance } = superForm(data, {
		customValidity: true,
		validators: zodClient(propertySchema),
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
</script>

<form method="POST" action="?/basicInfo" use:enhance class="">
	<div class="flex flex-col gap-4">
		<h2 class="h4">Basic Info</h2>
		<div class="grid grid-cols-2 gap-4">
			<label class="label"
				><span>Title</span><input
					name="title"
					bind:value={$form.title}
					class="input"
					class:input-error={$errors.title}
					title="Title"
					type="text"
				/></label
			>
			<label class="label"
				><span>Rent</span>
				<div class="flex items-center gap-2">
					<IconCurrencyDollar />
					<input
						name="rent"
						bind:value={$form.rent}
						class="input"
						class:input-error={$errors.rent}
						title="Rent"
						type="number"
					/>
				</div></label
			>
		</div>
		<div>
			<label class="label"
				><span>Description</span><textarea
					name="description"
					bind:value={$form.description}
					rows="4"
					class="textarea"
					class:input-error={$errors.description}
					title="Description"></textarea></label
			>
		</div>
		<div class="grid grid-cols-3 gap-4">
			<label class="label"
				><span>Bedrooms</span><input
					name="bedrooms"
					bind:value={$form.bedrooms}
					class="input"
					class:input-error={$errors.bedrooms}
					title="Bedrooms"
					type="number"
				/></label
			>
			<label class="label"
				><span>Bathrooms</span><input
					name="bathrooms"
					bind:value={$form.bathrooms}
					class="input"
					class:input-error={$errors.bathrooms}
					title="Bathrooms"
					type="number"
					step="0.5"
				/></label
			>
			<label class="label"
				><span>Square Feet</span><input
					name="squareFeet"
					bind:value={$form.squareFeet}
					class="input"
					class:input-error={$errors.squareFeet}
					title="Square Feet"
					type="number"
				/></label
			>
		</div>
		<h2 class="h4">Address</h2>
		<div class="grid md:grid-cols-2 gap-4">
			<label class="label"
				><span>Street Address</span><input
					name="streetAddress"
					bind:value={$form.streetAddress}
					class="input"
					class:input-error={$errors.streetAddress}
					title="Street Address"
				/></label
			>
			<label class="label"
				><span>Apartment Info</span><input
					name="apartmentInfo"
					bind:value={$form.apartmentInfo}
					class="input"
					class:input-error={$errors.apartmentInfo}
					title="Apartment Info"
				/></label
			>
		</div>
		<div class="grid md:grid-cols-2 gap-4">
			<label class="label"
				><span>City</span><input
					name="city"
					bind:value={$form.city}
					class="input"
					class:input-error={$errors.city}
					title="City"
				/></label
			>
			<div class="grid grid-cols-2 gap-4">
				<label class="label"
					><span>State</span><input
						name="state"
						bind:value={$form.state}
						class="input"
						class:input-error={$errors.state}
						title="State"
					/></label
				>
				<label class="label"
					><span>Zip Code</span><input
						name="zip"
						bind:value={$form.zip}
						class="input"
						class:input-error={$errors.zip}
						title="Zip Code"
					/></label
				>
			</div>
		</div>
		<div class="justify-self-start">
			<button type="submit" class="btn preset-filled-primary-500">Save</button>
		</div>
	</div>
</form>
