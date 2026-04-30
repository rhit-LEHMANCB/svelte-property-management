<script lang="ts">
	import { Tabs, Avatar } from '@skeletonlabs/skeleton-svelte';
	import type { DocumentWithId } from '../../../app';
	import { getDialogStore, type DialogSettings } from '$lib/Hooks/dialogCompat';
	import {
		IconClipboardList,
		IconInfoCircle,
		IconUserExclamation,
		IconUserMinus
	} from '@tabler/icons-svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	const dialogStore = getDialogStore();

	let {
		user,
		parent,
		background = 'bg-surface-100-800-token',
		width = 'w-modal',
		height = 'h-auto',
		padding = 'p-4',
		spacing = 'space-y-4',
		rounded = 'rounded-container-token',
		shadow = 'shadow-xl'
	} = $props<{
		user: DocumentWithId;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		parent: any;
		background?: string;
		width?: string;
		height?: string;
		padding?: string;
		spacing?: string;
		rounded?: string;
		shadow?: string;
	}>();
	const cModal = 'block overflow-y-auto'; // max-h-full overflow-y-auto overflow-x-hidden

	let tabSet = $state(0);

	let classesModal = $derived(
		`${cModal} ${background} ${width} ${height} ${padding} ${spacing} ${rounded} ${shadow}`
	);

	function deleteUserClicked() {
		dialogStore.close();
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
			successToast('User Successfully Removed.');
			invalidateAll();
		} else {
			errorToast('Error removing user.');
		}
	}

	function confirmModal(user: DocumentWithId) {
		const confirmModal: DialogSettings = {
			type: 'confirm',
			// Data
			title: 'Please Confirm',
			body: `Are you sure you wish to delete ${user.data.firstName} ${user.data.lastName}?`,
			// TRUE if confirm pressed, FALSE if cancel pressed
			response: (response: string | boolean) => handleConfirmResponse(response as boolean, user.id)
		};
		dialogStore.trigger(confirmModal);
	}

	async function getUserAssocProperty(id: string) {
		const response = await fetch(`/api/user/${id}/assoc`, {
			method: 'GET'
		});
		if (response.ok) {
			return (await response.json()) as DocumentWithId;
		} else {
			errorToast('Error getting user assoc.');
		}
	}

	let userProperty = $state<DocumentWithId | undefined | false>(false);

	onMount(async () => {
		userProperty = await getUserAssocProperty(user.id);
	});

	let formattedAddress = $derived(
		userProperty && userProperty.data
			? `${userProperty.data.streetAddress}, ${userProperty.data.city}, ${userProperty.data.state}`
			: ''
	);
</script>

{#if $dialogStore}
	<div class="modal card grid grid-flow-row {classesModal}">
		<Tabs value={String(tabSet)} onValueChange={(details) => (tabSet = Number(details.value))}>
			<Tabs.List>
				<Tabs.Trigger value="0">
					<div class="flex gap-2">
						<IconInfoCircle />
						<span>Info</span>
					</div>
				</Tabs.Trigger>
				<Tabs.Trigger value="1">
					<div class="flex gap-2">
						<IconClipboardList />
						<span>Insurance</span>
					</div>
				</Tabs.Trigger>
				<Tabs.Trigger value="2">
					<div class="flex gap-2">
						<IconUserExclamation />
						<span>Emergency Info</span>
					</div>
				</Tabs.Trigger>
				<Tabs.Indicator />
			</Tabs.List>
			<!-- Tab Panels --->
			<Tabs.Content value="0">
				<div class="flex flex-col gap-2">
					<div class="flex flex-row gap-5 items-center">
						<Avatar>
							{#if user.data.photoUrl}
								<Avatar.Image
									src={user.data.photoUrl}
									alt={`${user.data.firstName} ${user.data.lastName}`}
								/>
							{/if}
							<Avatar.Fallback
								>{`${user.data.firstName[0]}${user.data.lastName[0]}`}</Avatar.Fallback
							>
						</Avatar>
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
								onclick={() => dialogStore.close()}
								class="text-secondary-500 underline"
								href={`/admin/properties/${userProperty.id}/edit`}
							>
								{formattedAddress}
							</a>
						</span>
					{/if}
				</div>
			</Tabs.Content>
			<Tabs.Content value="1">
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
			</Tabs.Content>
			<Tabs.Content value="2">
				<div></div>
			</Tabs.Content>
		</Tabs>
		<footer class="modal-footer {parent.regionFooter}">
			<button onclick={deleteUserClicked} class="btn variant-filled-error"
				><IconUserMinus class="mr-2" />Delete</button
			>
			<button type="button" class="btn {parent.buttonNeutral}" onclick={() => dialogStore.close()}
				>Close</button
			>
		</footer>
	</div>
{/if}
