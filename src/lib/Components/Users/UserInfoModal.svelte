<script lang="ts">
	import { getModalStore, getToastStore, type ModalSettings } from '$lib/ui';
	import { Dialog, Tabs } from '@skeletonlabs/skeleton-svelte';
	import type { DocumentWithId } from '../../../app';
	import {
		IconClipboardList,
		IconInfoCircle,
		IconUserExclamation,
		IconUserMinus
	} from '@tabler/icons-svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import { refresh } from '$lib/Hooks/refresh';
	import UserAvatar from './UserAvatar.svelte';

	// Rendered inside the modal host's Dialog, so Dialog.Title names the dialog.
	let { user }: { user: DocumentWithId } = $props();

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	const fullName = $derived(`${user.data.firstName} ${user.data.lastName}`);

	function deleteUserClicked() {
		modalStore.close();
		const confirmModal: ModalSettings = {
			type: 'confirm',
			title: 'Please Confirm',
			body: `Are you sure you wish to delete ${user.data.firstName} ${user.data.lastName}?`,
			response: (confirmed: boolean) => {
				if (confirmed) removeUser(user.id);
			}
		};
		modalStore.trigger(confirmModal);
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

	let tab = $state('info');
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center gap-4">
		<UserAvatar src={user.data.photoUrl} name={fullName} class="size-14" />
		<Dialog.Title>
			{#snippet element(attributes)}
				<h2 {...attributes} class="h4">{fullName}</h2>
			{/snippet}
		</Dialog.Title>
	</div>
	<Dialog.Description class="sr-only">Contact, insurance and emergency details</Dialog.Description>

	<Tabs value={tab} onValueChange={(details) => (tab = details.value)}>
		<Tabs.List class="border-surface-200-800 border-b">
			<Tabs.Trigger value="info" class="btn btn-sm hover:preset-tonal"
				><IconInfoCircle class="size-4" aria-hidden="true" />Info</Tabs.Trigger
			>
			<Tabs.Trigger value="insurance" class="btn btn-sm hover:preset-tonal"
				><IconClipboardList class="size-4" aria-hidden="true" />Insurance</Tabs.Trigger
			>
			<Tabs.Trigger value="emergency" class="btn btn-sm hover:preset-tonal"
				><IconUserExclamation class="size-4" aria-hidden="true" />Emergency Info</Tabs.Trigger
			>
			<Tabs.Indicator class="bg-primary-500 h-0.5" />
		</Tabs.List>
		<Tabs.Content value="info" class="pt-4">
			{#if tab === 'info'}
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
					<dt class="opacity-70">Email</dt>
					<dd class="break-all">{user.data.email}</dd>
					<dt class="opacity-70">Phone Number</dt>
					<dd>{user.data.phoneNumber}</dd>
					<dt class="opacity-70">Property</dt>
					<dd>
						{#if !user.property}
							<strong>Not renting a property</strong>
						{:else}
							<a
								onclick={() => modalStore.close()}
								class="anchor"
								href={`/admin/properties/${user.property.id}/edit`}
							>
								{user.property.address}
							</a>
						{/if}
					</dd>
				</dl>
			{/if}
		</Tabs.Content>
		<Tabs.Content value="insurance" class="pt-4">
			{#if tab === 'insurance'}
				{#if user.data.insurance}
					<div class="flex flex-col gap-2">
						<span>Company Name: {user.data.insurance.companyName}</span>
						<span>Policy Number: {user.data.insurance.policyNumber}</span>
						<span
							>Effective from {user.data.insurance.startDate} to {user.data.insurance.endDate}</span
						>
					</div>
				{:else}
					<p class="my-8 text-center text-lg font-bold">No insurance info</p>
				{/if}
			{/if}
		</Tabs.Content>
		<Tabs.Content value="emergency" class="pt-4">
			{#if tab === 'emergency'}
				<p class="my-8 text-center opacity-80">No emergency contact on file</p>
			{/if}
		</Tabs.Content>
	</Tabs>

	<footer class="flex justify-end gap-2">
		<button
			data-needs-hydration
			type="button"
			onclick={deleteUserClicked}
			class="btn preset-filled-error-500"
			><IconUserMinus class="size-5" aria-hidden="true" />Delete</button
		>
		<button
			data-needs-hydration
			type="button"
			class="btn preset-tonal"
			onclick={() => modalStore.close()}>Close</button
		>
	</footer>
</div>
