<script lang="ts">
	import { getDialogStore } from '$lib/Hooks/dialogCompat';
	import { page } from '$app/stores';
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

	const drawerStore = getDialogStore();

	function drawerClose(): void {
		drawerStore.close();
	}

	export let isAdmin: boolean;
</script>

<nav class="list-nav p-4">
	<ul>
		{#if isAdmin}
			<li>
				<a
					href="/admin"
					onclick={drawerClose}
					class:bg-primary-active-token={$page.url.pathname === '/admin'}
					><IconHome class="mr-2" />Home</a
				>
			</li>
			<li>
				<a
					href="/profile"
					onclick={drawerClose}
					class:bg-primary-active-token={$page.url.pathname.startsWith('/profile')}
					><IconUser class="mr-2" />Profile</a
				>
			</li>
			<li>
				<a
					href="/admin/maintenance"
					onclick={drawerClose}
					class:bg-primary-active-token={$page.url.pathname.startsWith('/admin/maintenance')}
					><IconTool class="mr-2" />Maintenance</a
				>
			</li>
			<li>
				<a
					href="/admin/properties"
					onclick={drawerClose}
					class:bg-primary-active-token={$page.url.pathname.startsWith('/admin/properties')}
					><IconBuildingEstate class="mr-2" />Properties</a
				>
			</li>
			<li>
				<a
					href="/admin/users"
					onclick={drawerClose}
					class:bg-primary-active-token={$page.url.pathname.startsWith('/admin/users')}
					><IconUsers class="mr-2" />Users</a
				>
			</li>
		{:else}
			<li>
				<a href="/" onclick={drawerClose} class:bg-primary-active-token={$page.url.pathname === '/'}
					><IconDashboard class="mr-2" />Dashboard</a
				>
			</li>
			<li>
				<a
					href="/maintenance"
					onclick={drawerClose}
					class:bg-primary-active-token={$page.url.pathname.startsWith('/maintenance')}
					><IconTool class="mr-2" />Maintenance</a
				>
			</li>
			<li>
				<a
					href="/payment"
					onclick={drawerClose}
					class:bg-primary-active-token={$page.url.pathname.startsWith('/payment')}
					><IconCash class="mr-2" />Payment</a
				>
			</li>
			<li>
				<a
					href="/profile"
					onclick={drawerClose}
					class:bg-primary-active-token={$page.url.pathname.startsWith('/profile')}
					><IconUser class="mr-2" />Profile</a
				>
			</li>
			<li>
				<a
					href="/insurance"
					onclick={drawerClose}
					class:bg-primary-active-token={$page.url.pathname.startsWith('/insurance')}
					><IconClipboardList class="mr-2" />Insurance</a
				>
			</li>
			<li><a href="/" onclick={drawerClose}><IconInfoCircle class="mr-2" />About Us</a></li>
		{/if}
	</ul>
</nav>
