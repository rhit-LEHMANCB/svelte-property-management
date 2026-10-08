<script lang="ts">
	import { getModalStore, type ModalSettings, getToastStore, Tab, TabGroup, Avatar } from '$lib/ui';
	import type { DocumentWithId } from '../../../app';
	import {
		IconClipboardList,
		IconInfoCircle,
		IconUserExclamation,
		IconUserMinus
	} from '@tabler/icons-svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	export let user: DocumentWithId;

	function deleteUserClicked() {
		modalStore.close();
		confirmModal(user);
	}

	async function handleConfirmResponse(confirmed: boolean, userId: string) {
		if (confirmed) {
			await removeUser(userId);
		}
	}

	async function removeUser(id: string) {
		const response = await fetch(`/api/user/${id}`, {
			method: 'DELETE'
		});
		if (response.ok) {
			successToast('User Successfully Removed.', toastStore);
			invalidateAll();
		} else {
			errorToast('Error removing user.', toastStore);
		}
	}

	function confirmModal(user: DocumentWithId) {
		const confirmModal: ModalSettings = {
			type: 'confirm',
			// Data
			title: 'Please Confirm',
			body: `Are you sure you wish to delete ${user.data.firstName} ${user.data.lastName}?`,
			// TRUE if confirm pressed, FALSE if cancel pressed
			response: (response) => handleConfirmResponse(response, user.id)
		};
		modalStore.trigger(confirmModal);
	}

	async function getUserAssocProperty(id: string) {
		const response = await fetch(`/api/user/${id}/assoc`, {
			method: 'GET'
		});
		if (response.ok) {
			return (await response.json()) as DocumentWithId;
		} else {
			errorToast('Error getting user assoc.', toastStore);
		}
	}

	let userProperty: DocumentWithId | undefined | false = false;

	onMount(async () => {
		userProperty = await getUserAssocProperty(user.id);
	});

	$: formattedAddress =
		userProperty && userProperty.data
			? `${userProperty.data.streetAddress}, ${userProperty.data.city}, ${userProperty.data.state}`
			: '';

	let tabSet = 0;
</script>

<div
	class="card bg-surface-100-900 grid w-[min(92vw,32rem)] grid-flow-row space-y-4 overflow-y-auto p-4 shadow-xl"
>
	<TabGroup>
		<Tab bind:group={tabSet} name="info" value={0}>
			<div class="flex gap-2">
				<IconInfoCircle />
				<span>Info</span>
			</div>
		</Tab>
		<Tab bind:group={tabSet} name="insurance" value={1}
			><div class="flex gap-2">
				<IconClipboardList />
				<span>Insurance</span>
			</div></Tab
		>
		<Tab bind:group={tabSet} name="emergency" value={2}
			><div class="flex gap-2">
				<IconUserExclamation />
				<span>Emergency Info</span>
			</div></Tab
		>
		<!-- Tab Panels --->
		<svelte:fragment slot="panel">
			{#if tabSet === 0}
				<div class="flex flex-col gap-2">
					<div class="flex flex-row gap-5 items-center">
						<Avatar
							src={user.data.photoUrl}
							initials={`${user.data.firstName[0]}${user.data.lastName[0]}`}
						/>
						<strong class="h3">{`${user.data.firstName} ${user.data.lastName}`}</strong>
					</div>
					<div class="flex flex-col gap-2 flex-wrap">
						<p>Email: {user.data.email}</p>
						<p>Phone Number: {user.data.phoneNumber}</p>
					</div>
					{#if userProperty === false}
						<div class="placeholder animate-pulse w-32"></div>
					{:else if !userProperty?.data || !userProperty?.id}
						<strong>Not renting a property</strong>
					{:else}
						<span>
							<span>Property:</span>
							<a
								on:click={() => modalStore.close()}
								class="text-secondary-500 underline"
								href={`/admin/properties/${userProperty.id}/edit`}
							>
								{formattedAddress}
							</a>
						</span>
					{/if}
				</div>
			{:else if tabSet === 1}
				{#if user.data.insurance}
					<div class="flex flex-col gap-2">
						<span>Company Name: {user.data.insurance.companyName}</span>
						<span>Policy Number: {user.data.insurance.policyNumber}</span>
						<span
							>Effective from {user.data.insurance.startDate} to {user.data.insurance.endDate}</span
						>
					</div>
				{:else}
					<p class="text-center my-12 text-lg font-bold">No insurance info</p>
				{/if}
			{:else if tabSet === 2}
				<div></div>
			{/if}
		</svelte:fragment>
	</TabGroup>
	<footer class="flex justify-end gap-2">
		<button data-needs-hydration on:click={deleteUserClicked} class="btn preset-filled-error-500"
			><IconUserMinus class="mr-2" />Delete</button
		>
		<button
			data-needs-hydration
			type="button"
			class="btn preset-tonal"
			on:click={() => modalStore.close()}>Close</button
		>
	</footer>
</div>
