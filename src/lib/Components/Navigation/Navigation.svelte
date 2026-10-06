<script lang="ts">
	import { getDrawerStore } from '#lib/ui';
	import { page } from '$app/state';
	import {
		IconBuildingEstate,
		IconCash,
		IconClipboardList,
		IconDashboard,
		IconHome,
		IconInfoCircle,
		IconTool,
		IconUser,
		IconUsers
	} from '@tabler/icons-svelte';

	const drawerStore = getDrawerStore();

	function drawerClose(): void {
		drawerStore.close();
	}

	export let isAdmin: boolean;
</script>

<nav class="p-4">
	<ul class="flex flex-col gap-1">
		{#if isAdmin}
			<li>
				<a
					class="flex items-center rounded-base px-4 py-2 hover:preset-tonal"
					href="/admin"
					on:click={drawerClose}
					class:preset-filled-primary-500={page.url.pathname === '/admin'}
					><IconHome class="mr-2" />Home</a
				>
			</li>
			<li>
				<a
					class="flex items-center rounded-base px-4 py-2 hover:preset-tonal"
					href="/profile"
					on:click={drawerClose}
					class:preset-filled-primary-500={page.url.pathname.startsWith('/profile')}
					><IconUser class="mr-2" />Profile</a
				>
			</li>
			<li>
				<a
					class="flex items-center rounded-base px-4 py-2 hover:preset-tonal"
					href="/admin/maintenance"
					on:click={drawerClose}
					class:preset-filled-primary-500={page.url.pathname.startsWith('/admin/maintenance')}
					><IconTool class="mr-2" />Maintenance</a
				>
			</li>
			<li>
				<a
					class="flex items-center rounded-base px-4 py-2 hover:preset-tonal"
					href="/admin/properties"
					on:click={drawerClose}
					class:preset-filled-primary-500={page.url.pathname.startsWith('/admin/properties')}
					><IconBuildingEstate class="mr-2" />Properties</a
				>
			</li>
			<li>
				<a
					class="flex items-center rounded-base px-4 py-2 hover:preset-tonal"
					href="/admin/users"
					on:click={drawerClose}
					class:preset-filled-primary-500={page.url.pathname.startsWith('/admin/users')}
					><IconUsers class="mr-2" />Users</a
				>
			</li>
		{:else}
			<li>
				<a
					class="flex items-center rounded-base px-4 py-2 hover:preset-tonal"
					href="/"
					on:click={drawerClose}
					class:preset-filled-primary-500={page.url.pathname === '/'}
					><IconDashboard class="mr-2" />Dashboard</a
				>
			</li>
			<li>
				<a
					class="flex items-center rounded-base px-4 py-2 hover:preset-tonal"
					href="/maintenance"
					on:click={drawerClose}
					class:preset-filled-primary-500={page.url.pathname.startsWith('/maintenance')}
					><IconTool class="mr-2" />Maintenance</a
				>
			</li>
			<li>
				<a
					class="flex items-center rounded-base px-4 py-2 hover:preset-tonal"
					href="/payment"
					on:click={drawerClose}
					class:preset-filled-primary-500={page.url.pathname.startsWith('/payment')}
					><IconCash class="mr-2" />Payment</a
				>
			</li>
			<li>
				<a
					class="flex items-center rounded-base px-4 py-2 hover:preset-tonal"
					href="/profile"
					on:click={drawerClose}
					class:preset-filled-primary-500={page.url.pathname.startsWith('/profile')}
					><IconUser class="mr-2" />Profile</a
				>
			</li>
			<li>
				<a
					class="flex items-center rounded-base px-4 py-2 hover:preset-tonal"
					href="/insurance"
					on:click={drawerClose}
					class:preset-filled-primary-500={page.url.pathname.startsWith('/insurance')}
					><IconClipboardList class="mr-2" />Insurance</a
				>
			</li>
			<li>
				<a
					class="flex items-center rounded-base px-4 py-2 hover:preset-tonal"
					href="/"
					on:click={drawerClose}><IconInfoCircle class="mr-2" />About Us</a
				>
			</li>
		{/if}
	</ul>
</nav>
