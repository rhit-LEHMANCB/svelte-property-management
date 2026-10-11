<script lang="ts">
	import { getModalStore } from '$lib/ui';
	import type { DocumentWithId } from '../../../app';
	import { viewUserInfoModal } from '$lib/Hooks/modals';
	import DataList, { type DataColumn } from '$lib/Components/DataList/DataList.svelte';
	import UserAvatar from './UserAvatar.svelte';
	import type { Snippet } from 'svelte';

	let {
		users,
		label = 'users',
		actions,
		empty,
		toolbar
	}: {
		users: DocumentWithId[];
		label?: string;
		/** Row actions, rendered next to (never inside) the button that opens the user's details. */
		actions?: Snippet<[DocumentWithId]>;
		empty: Snippet;
		toolbar?: Snippet;
	} = $props();

	const modalStore = getModalStore();

	const fullName = (user: DocumentWithId) => `${user.data.firstName} ${user.data.lastName}`;
	const missingInsurance = (user: DocumentWithId) =>
		!user.data.insurance && user.data.permissions == 'user';

	const columns: DataColumn<DocumentWithId>[] = [
		{
			id: 'name',
			label: 'Name',
			sort: (user) => `${user.data.lastName ?? ''} ${user.data.firstName ?? ''}`
		},
		{ id: 'email', label: 'Email', sort: (user) => user.data.email },
		{ id: 'phone', label: 'Phone number' },
		{ id: 'actions', label: 'Actions', srOnly: true, class: 'text-right' }
	];
</script>

{#snippet nameButton(user: DocumentWithId)}
	<button
		data-needs-hydration
		type="button"
		class="flex items-center gap-3 rounded-base text-left hover:underline"
		onclick={() => viewUserInfoModal(user, modalStore)}
	>
		<span class="relative">
			<UserAvatar src={user.data.photoUrl} name={fullName(user)} />
			{#if missingInsurance(user)}
				<span
					class="badge-icon preset-filled-warning-500 absolute -top-1 -left-1"
					aria-hidden="true">!</span
				>
			{/if}
		</span>
		<span class="flex flex-col">
			<strong>{fullName(user)}</strong>
			{#if missingInsurance(user)}<span class="text-xs opacity-80">No insurance on file</span>{/if}
		</span>
	</button>
{/snippet}

<DataList
	{label}
	items={users}
	key={(user) => user.id}
	{columns}
	sortBy="name"
	searchText={(user) => `${fullName(user)} ${user.data.email ?? ''} ${user.data.phoneNumber ?? ''}`}
	{empty}
	{toolbar}
>
	{#snippet cell(user, column)}
		{#if column.id === 'name'}
			{@render nameButton(user)}
		{:else if column.id === 'email'}
			{user.data.email}
		{:else if column.id === 'phone'}
			{user.data.phoneNumber}
		{:else if column.id === 'actions'}
			<div class="flex items-center justify-end gap-2">{@render actions?.(user)}</div>
		{/if}
	{/snippet}
</DataList>
