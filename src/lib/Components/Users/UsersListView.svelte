<script lang="ts">
	import { Avatar, Pagination } from '@skeletonlabs/skeleton-svelte';
	import type { DocumentWithId } from '../../../app';
	import { openUserInfoModal } from '$lib/Hooks/modals';
	import UserInfoModal from './UserInfoModal.svelte';

	interface Props {
		users: DocumentWithId[];
		paginated?: boolean;
		class?: string;
		actionButton?: import('svelte').Snippet<[user: DocumentWithId]>;
	}

	let { users, paginated = false, class: className = '', actionButton }: Props = $props();

	let modalState = $state({
		open: false,
		user: null as DocumentWithId | null
	});

	let currentPage = $state(1);
	let pageSize = $state(5);

	let paginatedUsers = $derived(users.slice((currentPage - 1) * pageSize, currentPage * pageSize));

	function handleUserClick(user: DocumentWithId) {
		openUserInfoModal(user, modalState);
	}
</script>

<div class={`flex flex-col gap-5 ${className}`}>
	<ul class="list">
		{#each paginated ? paginatedUsers : users as user}
			<li class="hover:bg-surface-100-900 p-2">
				<button
					onclick={() => handleUserClick(user)}
					class="flex flex-row w-full gap-2 flex-wrap items-center"
				>
					<div class="group relative">
						<Avatar src={user.data.photoUrl} name={`${user.data.firstName} ${user.data.lastName}`}>
							{user.data.firstName[0]}{user.data.lastName[0]}
						</Avatar>
						{#if !user.data.insurance && user.data.permissions == 'user'}
							<span class="badge-icon preset-filled-warning-500 absolute -left-1 -top-1">!</span>
						{/if}
					</div>
					<div class="flex flex-col flex-wrap text-left">
						<span>Name: <strong>{`${user.data.firstName} ${user.data.lastName}`}</strong></span>
						<p>Email: {user.data.email}</p>
						<p>Phone Number: {user.data.phoneNumber}</p>
					</div>
					<div class="flex grow justify-end">
						{#if actionButton}
							{@render actionButton(user)}
						{/if}
					</div>
				</button>
			</li>
		{/each}
	</ul>
	{#if paginated}
		<Pagination
			data={users}
			page={currentPage}
			{pageSize}
			onPageChange={(details) => (currentPage = details.page)}
		/>
	{/if}
</div>

<UserInfoModal
	open={modalState.open}
	user={modalState.user}
	onOpenChange={(open) => (modalState.open = open)}
/>
