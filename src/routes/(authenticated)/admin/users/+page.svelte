<script lang="ts">
	import type { PageData } from './$types';
	import { getModalStore, getToastStore, type ModalSettings } from '$lib/ui';
	import { IconUserMinus, IconUserPlus, IconUserShare, IconUsers } from '@tabler/icons-svelte';
	import { emailSchema } from '$lib/schemas';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { refresh } from '$lib/Hooks/refresh';
	import type { DocumentWithId } from '../../../../app';
	import RowMenu from '$lib/Components/DataList/RowMenu.svelte';
	import EmptyState from '$lib/Components/DataList/EmptyState.svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import UsersListView from '$lib/Components/Users/UsersListView.svelte';
	import { viewUserInfoModal } from '$lib/Hooks/modals';

	let { data }: { data: PageData } = $props();

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	async function handleResponse(response: string) {
		if (!response) {
			return;
		}
		try {
			emailSchema.parse(response);
		} catch {
			errorToast('Please enter a valid email.', toastStore);
			return;
		}
		const fetchResponse = await fetch('/api/user/add', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ email: response })
		});
		if (fetchResponse.ok) {
			refresh();
			successToast('User Successfully Created.', toastStore);
		} else {
			errorToast('Error creating user.', toastStore);
		}
	}

	const emailModal: ModalSettings = {
		type: 'prompt',
		title: 'Enter User Email',
		body: 'Provide the email to be used for the new user.',
		valueAttr: { type: 'text', minlength: 1, maxlength: 200, required: true },
		response: handleResponse
	};

	function confirmModal(user: DocumentWithId) {
		modalStore.trigger({
			type: 'confirm',
			title: 'Please Confirm',
			body: `Are you sure you wish to delete ${user.data.firstName} ${user.data.lastName}?`,
			response: (confirmed: boolean) => {
				if (confirmed) removeUser(user.id);
			}
		});
	}

	async function removeUser(id: string) {
		const response = await fetch(`/api/user/${id}`, {
			method: 'DELETE'
		});
		if (response.ok) {
			successToast('User Successfully Removed.', toastStore);
			refresh();
		} else {
			errorToast('Error removing user.', toastStore);
		}
	}
</script>

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title="Users" />
	<UsersListView users={data.users}>
		{#snippet toolbar()}
			<button
				data-needs-hydration
				type="button"
				onclick={() => modalStore.trigger(emailModal)}
				class="btn preset-filled-primary-500"
				><IconUserPlus class="size-5" aria-hidden="true" />Add User</button
			>
		{/snippet}
		{#snippet actions(user)}
			<RowMenu
				label="Actions for {user.data.firstName} {user.data.lastName}"
				actions={[
					{
						label: 'View More',
						icon: IconUserShare,
						run: () => viewUserInfoModal(user, modalStore)
					},
					{ label: 'Delete', icon: IconUserMinus, danger: true, run: () => confirmModal(user) }
				]}
			/>
		{/snippet}
		{#snippet empty()}
			<EmptyState icon={IconUsers} title="No users yet">
				Add a user to send them a welcome email with a link to set their password.
			</EmptyState>
		{/snippet}
	</UsersListView>
</div>
