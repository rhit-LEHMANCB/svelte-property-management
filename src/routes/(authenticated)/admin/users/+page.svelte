<script lang="ts">
	import type { PageData } from './$types';
	import { IconUserMinus, IconUserPlus, IconUserShare } from '@tabler/icons-svelte';
	import { Modal } from '@skeletonlabs/skeleton-svelte';
	import { emailSchema } from '$lib/schemas';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { invalidateAll } from '$app/navigation';
	import type { DocumentWithId } from '../../../../app';
	import PopupMenu from '$lib/Components/PopupMenu/PopupMenu.svelte';
	import PopupMenuItem from '$lib/Components/PopupMenu/PopupMenuItem.svelte';
	import UsersListView from '$lib/Components/Users/UsersListView.svelte';
	import { openUserInfoModal } from '$lib/Hooks/modals';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let emailModalOpen = $state(false);
	let confirmModalOpen = $state(false);
	let emailInput = $state('');
	let selectedUser: DocumentWithId | null = $state(null);

	async function handleResponse() {
		if (!emailInput) {
			return;
		}
		try {
			emailSchema.parse(emailInput);
		} catch (error) {
			errorToast('Please enter a valid email.');
			return;
		}
		const fetchResponse = await fetch('/api/user/add', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ email: emailInput })
		});
		if (fetchResponse.ok) {
			invalidateAll();
			successToast('User Successfully Created.');
			emailModalOpen = false;
			emailInput = '';
		} else {
			errorToast('Error creating user.');
		}
	}

	async function handleConfirmResponse(confirmed: boolean) {
		if (confirmed && selectedUser) {
			await removeUser(selectedUser.id);
		}
		confirmModalOpen = false;
		selectedUser = null;
	}

	function confirmModal(user: DocumentWithId) {
		selectedUser = user;
		confirmModalOpen = true;
	}

	function addUserClicked() {
		emailModalOpen = true;
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
</script>

{#snippet actionButton(user: DocumentWithId)}
	<PopupMenu>
		<PopupMenuItem
			text="View More"
			onClickFunction={() => openUserInfoModal(user, { open: true, user })}
		>
			{#snippet icon()}
				<IconUserShare />
			{/snippet}
		</PopupMenuItem>
		<PopupMenuItem text="Delete" onClickFunction={() => confirmModal(user)} isDelete>
			{#snippet icon()}
				<IconUserMinus />
			{/snippet}
		</PopupMenuItem>
	</PopupMenu>
{/snippet}

{#snippet emailModalContent()}
	<div class="card p-4 space-y-4 w-[400px] max-w-[90vw]">
		<header class="text-xl font-bold">Enter User Email</header>
		<p>Provide the email to be used for the new user.</p>
		<input
			type="text"
			bind:value={emailInput}
			class="input"
			minlength="1"
			maxlength="200"
			required
		/>
		<footer class="flex justify-end gap-2">
			<button
				type="button"
				class="btn preset-tonal-surface"
				onclick={() => (emailModalOpen = false)}
			>
				Cancel
			</button>
			<button type="button" class="btn preset-filled-primary-500" onclick={handleResponse}>
				Create
			</button>
		</footer>
	</div>
{/snippet}

{#snippet confirmModalContent()}
	<div class="card p-4 space-y-4 w-[400px] max-w-[90vw]">
		<header class="text-xl font-bold">Please Confirm</header>
		<p>
			Are you sure you wish to delete {selectedUser?.data.firstName}
			{selectedUser?.data.lastName}?
		</p>
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

<div class="card m-5 grid grid-flow-row p-5 gap-5">
	<button onclick={addUserClicked} class="btn btn-sm preset-filled-primary-500 justify-self-start">
		<IconUserPlus class="mr-2" />Add User
	</button>
	<UsersListView users={data.users} paginated {actionButton} />
</div>

{#if emailModalOpen}
	<Modal
		open={emailModalOpen}
		onOpenChange={(details) => (emailModalOpen = details.open)}
		content={emailModalContent}
	/>
{/if}

{#if confirmModalOpen}
	<Modal
		open={confirmModalOpen}
		onOpenChange={(details) => (confirmModalOpen = details.open)}
		content={confirmModalContent}
	/>
{/if}
