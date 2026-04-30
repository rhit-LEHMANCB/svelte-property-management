<script lang="ts">
	import { getDialogStore } from '$lib/Hooks/dialogCompat';
	import type { DocumentWithId } from '../../../app';
	import { viewUserInfoModal } from '$lib/Hooks/modals';
	import { Avatar, Pagination } from '@skeletonlabs/skeleton-svelte';

	export let users: DocumentWithId[];
	export let paginated = false;
	const dialogStore = getDialogStore();

	let page = $state({
		page: 1,
		limit: 5,
		size: users.length,
		amounts: [1, 2, 5, 10]
	});

	let paginatedUsers = $derived(users.slice(
		(page.page - 1) * page.limit, // start
		(page.page - 1) * page.limit + page.limit // end
	));
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
						<Avatar.Root>
							{#if user.data.photoUrl}
								<Avatar.Image src={user.data.photoUrl} alt={`${user.data.firstName} ${user.data.lastName}`} />
							{/if}
							<Avatar.Fallback>{`${user.data.firstName[0]}${user.data.lastName[0]}`}</Avatar.Fallback>
						</Avatar.Root>
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
		<Pagination count={users.length} pageSize={page.limit} page={page.page} onPageChange={(event) => page.page = event.page}>
			<Pagination.PrevTrigger />
			<Pagination.Context>
				{#snippet children(pagination)}
					{#each pagination().pages as p, index (p)}
						{#if p.type === 'page'}
							<Pagination.Item {...p}>
								{p.value}
							</Pagination.Item>
						{:else}
							<Pagination.Ellipsis {index}>&#8230;</Pagination.Ellipsis>
						{/if}
					{/each}
				{/snippet}
			</Pagination.Context>
			<Pagination.NextTrigger />
		</Pagination>
	{/if}
</div>
