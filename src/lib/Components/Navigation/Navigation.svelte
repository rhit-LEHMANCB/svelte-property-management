<script lang="ts">
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

	export let isAdmin: boolean;
</script>

<nav class="list-nav p-4">
	<ul>
		{#if isAdmin}
			<li>
				<a href="/admin" class:bg-primary-active-token={$page.url.pathname === '/admin'}>
					<IconHome class="mr-2" />Home
				</a>
			</li>
			<li>
				<a
					href="/profile"
					class:bg-primary-active-token={$page.url.pathname.startsWith('/profile')}
				>
					<IconUser class="mr-2" />Profile
				</a>
			</li>
			<li>
				<a
					href="/admin/maintenance"
					class:bg-primary-active-token={$page.url.pathname.startsWith('/admin/maintenance')}
				>
					<IconTool class="mr-2" />Maintenance
				</a>
			</li>
			<li>
				<a
					href="/admin/properties"
					class:bg-primary-active-token={$page.url.pathname.startsWith('/admin/properties')}
				>
					<IconBuildingEstate class="mr-2" />Properties
				</a>
			</li>
			<li>
				<a
					href="/admin/users"
					class:bg-primary-active-token={$page.url.pathname.startsWith('/admin/users')}
				>
					<IconUsers class="mr-2" />Users
				</a>
			</li>
		{:else}
			<li>
				<a href="/" class:bg-primary-active-token={$page.url.pathname === '/'}>
					<IconDashboard class="mr-2" />Dashboard
				</a>
			</li>
			<li>
				<a
					href="/maintenance"
					class:bg-primary-active-token={$page.url.pathname.startsWith('/maintenance')}
				>
					<IconTool class="mr-2" />Maintenance
				</a>
			</li>
			<li>
				<a
					href="/payment"
					class:bg-primary-active-token={$page.url.pathname.startsWith('/payment')}
				>
					<IconCash class="mr-2" />Payment
				</a>
			</li>
			<li>
				<a
					href="/profile"
					class:bg-primary-active-token={$page.url.pathname.startsWith('/profile')}
				>
					<IconUser class="mr-2" />Profile
				</a>
			</li>
			<li>
				<a
					href="/insurance"
					class:bg-primary-active-token={$page.url.pathname.startsWith('/insurance')}
				>
					<IconClipboardList class="mr-2" />Insurance
				</a>
			</li>
			<li><a href="/"><IconInfoCircle class="mr-2" />About Us</a></li>
		{/if}
	</ul>
</nav>
