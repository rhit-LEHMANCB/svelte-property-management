<script lang="ts">
	import { Avatar, Pagination, getDialogStore } from '@skeletonlabs/skeleton-svelte';
	import type { DocumentWithId } from '../../../app';
	import { viewUserInfoModal } from '$lib/Hooks/modals';

	export let users: DocumentWithId[];
	export let paginated = false;
	const dialogStore = getDialogStore();

	$: page = {
		page: 0,
		limit: 5,
		size: users.length,
		amounts: [1, 2, 5, 10]
	};

	$: paginatedUsers = users.slice(
		page.page * page.limit, // start
		page.page * page.limit + page.limit // end
	);
</script>

<div class={`flex flex-col gap-5 ${$$props.class ?? ''}`}>
	<ul class="list">
		{#each paginated ? paginatedUsers : users as user}
			<li class="hover:bg-surface-hover-token p-2">
				<button
					on:click={() => viewUserInfoModal(user, dialogStore)}
					class="flex flex-row w-full gap-2 flex-wrap items-center"
				>
					<div class="group relative">
						<Avatar
							src={user.data.photoUrl}
							initials={`${user.data.firstName[0]}${user.data.lastName[0]}`}
						/>
						{#if !user.data.insurance && user.data.permissions == 'user'}
							<span class="badge-icon variant-filled-warning absolute -left-1 -top-1">!</span>
						{/if}
					</div>
					<div class="flex flex-col flex-wrap text-left">
						<span>Name: <strong>{`${user.data.firstName} ${user.data.lastName}`}</strong></span>
						<p>Email: {user.data.email}</p>
						<p>Phone Number: {user.data.phoneNumber}</p>
					</div>
					<div class="flex grow justify-end">
						<slot name="actionButton" {user} />
					</div>
				</button>
			</li>
		{/each}
	</ul>
	{#if paginated}
		<Pagination bind:settings={page} showFirstLastButtons={false} showPreviousNextButtons={true} />
	{/if}
</div>
