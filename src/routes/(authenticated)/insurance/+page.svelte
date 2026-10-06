<script lang="ts">
	import { superForm } from 'sveltekit-superforms/client';
	import type { PageData } from './$types';
	import { insuranceSchema } from '$lib/schemas';
	import { successToast } from '$lib/Hooks/toasts';
	import { getToastStore } from '@skeletonlabs/skeleton';
	import DateInput from '$lib/DatePicker/DateInput.svelte';

	export let data: PageData;
	const toastStore = getToastStore();

	const { form, errors, enhance } = superForm(data.form, {
		customValidity: true,
		validators: insuranceSchema,
		onUpdated({ form }) {
			if (form.message === 'Form submitted') {
				// Display the message using a toast library
				successToast('Successfully updated user info.', toastStore);
			}
		}
	});
</script>

<div class="grid grid-cols-1 md:grid-cols-2 m-5 gap-2">
	<div class="flex flex-col gap-2">
		<div class="card">
			<form method="POST" use:enhance class="h-auto m-5">
				<strong class="h3">Insurance</strong>
				<div class="grid grid-rows-4 grid-flow-col gap-2 mt-2">
					<div>
						<label class="label"
							><span>Insurance Company Name</span><input
								name="companyName"
								bind:value={$form.companyName}
								class="input"
								class:input-error={$errors.companyName}
								title="Insurance Company Name"
								type="text"
							/></label
						>
					</div>
					<div>
						<label class="label"
							><span>Policy Number</span><input
								name="policyNumber"
								bind:value={$form.policyNumber}
								class="input"
								class:input-error={$errors.policyNumber}
								title="Policy Number"
								type="text"
							/></label
						>
					</div>
					<div>
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<label class="label"
							><span>Start Date</span>
							<DateInput
								bind:value={$form.startDate}
								name="startDate"
								title="Start Date"
								errors={$errors.startDate}
							/>
						</label>
					</div>
					<div>
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<label class="label"
							><span>End Date</span>
							<DateInput
								bind:value={$form.endDate}
								name="endDate"
								title="End Date"
								errors={$errors.endDate}
							/>
						</label>
					</div>
				</div>
				<button type="submit" class="btn variant-filled-secondary mt-5">Save</button>
			</form>
		</div>
	</div>
</div>
