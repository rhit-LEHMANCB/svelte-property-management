<script lang="ts">
	import { goto } from '$app/navigation';
	import DateInput from '$lib/DatePicker/DateInput.svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { leaseSchema, type LeaseSchema } from '$lib/schemas';
	import {
		getToastStore,
		popup,
		type AutocompleteOption,
		type PopupSettings,
		Autocomplete
	} from '@skeletonlabs/skeleton';
	import { IconCurrencyDollar, IconUserMinus } from '@tabler/icons-svelte';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import { fileProxy, superForm } from 'sveltekit-superforms/client';
	import { zodClient } from 'sveltekit-superforms/adapters';

	export let data: SuperValidated<Infer<LeaseSchema>>;
	export let usersOptions: {
		label: string;
		value: string;
	}[];

	const toastStore = getToastStore();
	const { form, errors, enhance } = superForm(data, {
		customValidity: true,
		validators: zodClient(leaseSchema),
		onUpdated({ form }) {
			if (form.message === 'Form submitted') {
				// Display the message using a toast library
				successToast('Successfully created lease.', toastStore);
			} else if (form.message.startsWith('id')) {
				successToast('Successfully created lease.', toastStore);
				const id = form.message.slice(2);
				goto(`/manager/admin/lease/${id}/edit`);
			}
		}
	});

	let popupSettings: PopupSettings = {
		event: 'focus-click',
		target: 'popupAutocomplete',
		placement: 'bottom'
	};

	let selectedUserName = '';
	let selectedUserId = '';
	let userNames: string[] = [];
	function onTenantSelect(event: CustomEvent<AutocompleteOption>): void {
		selectedUserName = event.detail.label;
		selectedUserId = event.detail.value as string;
	}
	async function addTenant() {
		if (!selectedUserName || !selectedUserId) {
			return;
		}
		if ($form.users.includes(selectedUserId)) {
			errorToast("That user is already on the lease.", toastStore);
			selectedUserId = '';
			selectedUserName = '';
			return;
		}
		$form.users = [...$form.users, selectedUserId];
		userNames = [...userNames, selectedUserName];
		selectedUserName = '';
		selectedUserId = '';
	}

	function removeUser(index: number) {
		$form.users = $form.users.filter((_, i) => index != i);
		userNames = userNames.filter((_, i) => index != i);
	}

	$: filteredUsers = usersOptions.filter((option) =>  !$form.users.includes(option.value));

	const file = fileProxy(form, 'lease');
</script>

<form method="POST" use:enhance action="?/lease" class="p-5" enctype="multipart/form-data">
	<div class="flex flex-col gap-4">
		<strong class="h4">Create Lease</strong>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<label class="label">
				<span>Lease Document</span>
				<input
					name="lease"
					class="input"
					bind:files={$file}
					class:input-error={$errors.lease}
					type="file"
					accept=".pdf"
				/>
			</label>
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
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
		<strong class="h4">Users</strong>
		<label class="label">
			<div class="grid grid-cols-4 lg:grid-cols-8 gap-4">
				<input
					class="input autocomplete col-span-3"
					type="search"
					class:input-error={$errors.users?._errors}
					bind:value={selectedUserName}
					placeholder="Search..."
					use:popup={popupSettings}
				/>
				<div class="justify-self-start">
					<button on:click|preventDefault={addTenant} class="btn variant-filled-secondary"
						>Add</button
					>
				</div>
			</div>
			{#if $errors.users?._errors}<span class="text-error-400-500-token">{$errors.users?._errors}</span>{/if}
		</label>
		<div class="card w-full max-w-sm shadow-xl" data-popup="popupAutocomplete">
			<div class="max-h-96 overflow-auto">
				<Autocomplete
					bind:input={selectedUserName}
					options={filteredUsers}
					on:selection={onTenantSelect}
				/>
			</div>
			<div class="arrow bg-surface-100-800-token" />
		</div>
		<div class="flex flex-row flex-wrap gap-5">
			{#each $form.users as _, i}
				<div class="flex flex-row items-center gap-5 border-token input w-auto p-2 rounded-token">
					<div>{userNames[i]}</div>
					<div><button on:click|preventDefault={() => removeUser(i)} class="btn btn-icon variant-filled-error"><IconUserMinus /></button></div>
				</div>
				<input
					name="users"
					class="hidden"
					bind:value={$form.users[i]}
					class:input-error={$errors.users ? $errors.users[i] : false}
					title="User"
					type="text"
				/>
			{/each}
		</div>
		<div class="justify-self-start">
			<button type="submit" class="btn variant-filled-secondary">Create Lease</button>
		</div>
	</div>
</form>
