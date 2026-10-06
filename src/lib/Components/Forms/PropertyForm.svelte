<script lang="ts">
	import { superForm } from 'sveltekit-superforms/client';
	import { propertySchema, type PropertySchema } from '$lib/schemas';
	import { successToast } from '$lib/Hooks/toasts';
	import { IconCurrencyDollar } from '@tabler/icons-svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { getToastStore } from '@skeletonlabs/skeleton';
	import { getGoogle } from '$lib/google';

	const toastStore = getToastStore();

	export let data: SuperValidated<PropertySchema>;

	const { form, errors, enhance } = superForm(data, {
		customValidity: true,
		validators: propertySchema,
		onUpdated({ form }) {
			if (form.message === 'Form submitted') {
				// Display the message using a toast library
				successToast('Successfully added info.', toastStore);
			} else if (form.message.startsWith('id')) {
				successToast('Successfully created property', toastStore);
				const id = form.message.slice(2);
				goto(`/admin/properties/${id}/edit`);
			}
		}
	});

	// eslint-disable-next-line no-undef
	let autocomplete: google.maps.places.Autocomplete;
	let addressLookupField: HTMLInputElement;

	onMount(async () => {
		const google = await getGoogle();
		if (!google) {
			console.warn('Error loading google maps Api');
			return;
		}
		// Create the autocomplete object, restricting the search predictions to
		// addresses in the US and Canada.
		autocomplete = new google.maps.places.Autocomplete(addressLookupField, {
			componentRestrictions: { country: ['us'] },
			fields: ['address_components', 'geometry'],
			types: ['address']
		});

		// When the user selects an address from the drop-down, populate the
		// address fields in the form.
		autocomplete.addListener('place_changed', fillInAddress);
	});

	function fillInAddress() {
		// Get the place details from the autocomplete object.
		const place = autocomplete.getPlace();
		let address1 = '';
		let postcode = '';

		// Get each component of the address from the place details,
		// and then fill-in the corresponding field on the form.
		// place.address_components are google.maps.GeocoderAddressComponent objects
		// which are documented at http://goo.gle/3l5i5Mr
		// eslint-disable-next-line no-undef
		for (const component of place.address_components as google.maps.GeocoderAddressComponent[]) {
			const componentType = component.types[0];

			switch (componentType) {
				case 'street_number': {
					address1 = `${component.long_name} ${address1}`;
					break;
				}

				case 'route': {
					address1 += component.short_name;
					break;
				}

				case 'postal_code': {
					postcode = `${component.long_name}${postcode}`;
					break;
				}

				case 'postal_code_suffix': {
					postcode = `${postcode}-${component.long_name}`;
					break;
				}

				case 'locality':
					$form.city = component.long_name;
					break;

				case 'administrative_area_level_1': {
					$form.state = component.short_name;
					break;
				}
			}
		}

		$form.streetAddress = address1;
		$form.zip = postcode;
	}
</script>

<form method="POST" action="?/basicInfo" use:enhance class="pt-0 p-5">
	<div class="flex flex-col gap-4">
		<strong class="h4">Basic Info</strong>
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
				<div class="input-group input-group-divider grid-cols-[auto_1fr_auto]">
					<div class="input-group-shim"><IconCurrencyDollar /></div>
					<input
						name="rent"
						bind:value={$form.rent}
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
					title="Description"
				/></label
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
		<strong class="h4">Address</strong>
		<div>
			<label class="label"
				><span>Address Lookup</span><input
					class="input"
					bind:this={addressLookupField}
					title="Address Lookup"
					type="text"
				/></label
			>
		</div>
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
			<button type="submit" class="btn variant-filled-secondary">Save</button>
		</div>
	</div>
</form>
