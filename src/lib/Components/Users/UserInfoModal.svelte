<script lang="ts">
	import { Modal, Tabs, Avatar } from '@skeletonlabs/skeleton-svelte';
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

	interface Props {
		open?: boolean;
		user?: DocumentWithId | null;
		onOpenChange?: (open: boolean) => void;
	}

	let { open = false, user = null, onOpenChange }: Props = $props();

	let confirmModalOpen = $state(false);
	let tabSet = $state('info');
	let userProperty: DocumentWithId | false = $state(false);

	let formattedAddress = $derived(() => {
		if (userProperty && typeof userProperty === 'object' && userProperty.data) {
			return `${userProperty.data.streetAddress}, ${userProperty.data.city}, ${userProperty.data.state}`;
		}
		return '';
	});

	onMount(async () => {
		if (user) {
			userProperty = await getUserAssocProperty(user.id);
		}
	});

	$effect(() => {
		if (open && user) {
			getUserAssocProperty(user.id).then((prop) => {
				userProperty = prop;
			});
		}
	});

	async function getUserAssocProperty(id: string): Promise<DocumentWithId | false> {
		const response = await fetch(`/api/user/${id}/assoc`, {
			method: 'GET'
		});
		if (response.ok) {
			return (await response.json()) as DocumentWithId;
		} else {
			errorToast('Error getting user assoc.');
			return false;
		}
	}

	function deleteUserClicked() {
		confirmModalOpen = true;
	}

	async function handleConfirmResponse(confirmed: boolean) {
		if (confirmed && user) {
			await removeUser(user.id);
		}
		confirmModalOpen = false;
	}

	async function removeUser(id: string) {
		const response = await fetch(`/api/user/${id}`, {
			method: 'DELETE'
		});
		if (response.ok) {
			successToast('User Successfully Removed.');
			invalidateAll();
			onOpenChange?.(false);
		} else {
			errorToast('Error removing user.');
		}
	}

	function closeModal() {
		onOpenChange?.(false);
	}
</script>

{#snippet mainContent()}
	{#if user}
		<div class="card p-4 space-y-4 w-[600px] max-w-[90vw]">
			<Tabs value={tabSet} onValueChange={(details) => (tabSet = details.value)}>
				{#snippet list()}
					<Tabs.Control value="info">
						<div class="flex gap-2 items-center">
							<IconInfoCircle />
							<span>Info</span>
						</div>
					</Tabs.Control>
					<Tabs.Control value="insurance">
						<div class="flex gap-2 items-center">
							<IconClipboardList />
							<span>Insurance</span>
						</div>
					</Tabs.Control>
					<Tabs.Control value="emergency">
						<div class="flex gap-2 items-center">
							<IconUserExclamation />
							<span>Emergency Info</span>
						</div>
					</Tabs.Control>
				{/snippet}
				{#snippet content()}
					<div class="py-4">
						{#if tabSet === 'info'}
							<div class="flex flex-col gap-4">
								<div class="flex flex-row gap-5 items-center">
									<Avatar
										src={user.data.photoUrl}
										name={`${user.data.firstName} ${user.data.lastName}`}
									>
										{user.data.firstName[0]}{user.data.lastName[0]}
									</Avatar>
									<strong class="h3">{`${user.data.firstName} ${user.data.lastName}`}</strong>
								</div>
								<div class="flex flex-col gap-2 flex-wrap">
									<p>Email: {user.data.email}</p>
									<p>Phone Number: {user.data.phoneNumber}</p>
								</div>
								{#if userProperty === false}
									<div class="placeholder animate-pulse w-32 h-4 bg-surface-200 rounded"></div>
								{:else if typeof userProperty === 'object' && userProperty.data && userProperty.id}
									<span>
										<span>Property:</span>
										<a
											onclick={closeModal}
											class="text-secondary-500 underline"
											href={`/admin/properties/${userProperty.id}/edit`}
										>
											{formattedAddress()}
										</a>
									</span>
								{:else}
									<strong>Not renting a property</strong>
								{/if}
							</div>
						{:else if tabSet === 'insurance'}
							{#if user.data.insurance}
								<div class="flex flex-col gap-2">
									<span>Company Name: {user.data.insurance.companyName}</span>
									<span>Policy Number: {user.data.insurance.policyNumber}</span>
									<span
										>Effective from {user.data.insurance.startDate} to {user.data.insurance
											.endDate}</span
									>
								</div>
							{:else}
								<p class="text-center my-12 text-lg font-bold">No insurance info</p>
							{/if}
						{:else if tabSet === 'emergency'}
							<div></div>
						{/if}
					</div>
				{/snippet}
			</Tabs>
			<footer class="flex justify-between items-center pt-4 border-t border-surface-200">
				<button onclick={deleteUserClicked} class="btn preset-filled-error-500">
					<IconUserMinus class="mr-2" />Delete
				</button>
				<button type="button" class="btn preset-tonal-surface" onclick={closeModal}> Close </button>
			</footer>
		</div>
	{/if}
{/snippet}

{#snippet confirmContent()}
	<div class="card p-4 space-y-4 w-[400px] max-w-[90vw]">
		<header class="text-xl font-bold">Please Confirm</header>
		<p>Are you sure you wish to delete {user?.data.firstName} {user?.data.lastName}?</p>
		<footer class="flex justify-end gap-2">
			<button
				type="button"
				class="btn preset-tonal-surface"
				onclick={() => (confirmModalOpen = false)}
			>
				Cancel
			</button>
			<button
				type="button"
				class="btn preset-filled-error-500"
				onclick={() => handleConfirmResponse(true)}
			>
				Delete
			</button>
		</footer>
	</div>
{/snippet}

{#if open}
	<Modal open={true} onOpenChange={(detail) => onOpenChange?.(detail.open)} content={mainContent} />
{/if}

{#if confirmModalOpen}
	<Modal
		open={confirmModalOpen}
		onOpenChange={(detail) => (confirmModalOpen = detail.open)}
		content={confirmContent}
	/>
{/if}
