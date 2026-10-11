<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import type { PageData } from './$types';
	import { insuranceSchema } from '$lib/schemas';
	import { successToast } from '$lib/Hooks/toasts';
	import { getToastStore } from '$lib/ui';
	import DateInput from '$lib/DatePicker/DateInput.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';

	export let data: PageData;
	const toastStore = getToastStore();

	const { form, errors, enhance } = superForm(data.form, {
		customValidity: true,
		validators: zodClient(insuranceSchema),
		onUpdated({ form }) {
			if (form.message === 'Form submitted') {
				// Display the message using a toast library
				successToast('Successfully updated user info.', toastStore);
			}
		}
	});
</script>

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title="Insurance" />
	<div class="max-w-2xl">
		<div class="card bg-surface-100-900">
			<form method="POST" use:enhance class="p-4 sm:p-6">
				<h2 class="h4">Renters insurance</h2>
				<div class="mt-3 grid gap-3 sm:grid-cols-2">
					<div>
						<label class="label"
							><span class="label-text">Insurance Company Name</span><input
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
							><span class="label-text">Policy Number</span><input
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
						<label class="label"
							><span class="label-text">Start Date</span>
							<DateInput
								bind:value={$form.startDate}
								name="startDate"
								title="Start Date"
								errors={$errors.startDate}
							/>
						</label>
					</div>
					<div>
						<label class="label"
							><span class="label-text">End Date</span>
							<DateInput
								bind:value={$form.endDate}
								name="endDate"
								title="End Date"
								errors={$errors.endDate}
							/>
						</label>
					</div>
				</div>
				<button type="submit" class="btn preset-filled-primary-500 mt-5">Save</button>
			</form>
		</div>
	</div>
</div>
