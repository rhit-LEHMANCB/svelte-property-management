<script lang="ts">
	import { Navigation } from '@skeletonlabs/skeleton-svelte';
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

	let { isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: (event: MouseEvent) => void } =
		$props();

	type Entry = {
		label: string;
		href: string;
		icon: typeof IconHome;
		/** Whether this entry is the current page; entries without it are never marked current. */
		current?: (path: string) => boolean;
	};

	const adminEntries: Entry[] = [
		{ label: 'Home', href: '/admin', icon: IconHome, current: (p) => p === '/admin' },
		{
			label: 'Profile',
			href: '/profile',
			icon: IconUser,
			current: (p) => p.startsWith('/profile')
		},
		{
			label: 'Maintenance',
			href: '/admin/maintenance',
			icon: IconTool,
			current: (p) => p.startsWith('/admin/maintenance')
		},
		{
			label: 'Properties',
			href: '/admin/properties',
			icon: IconBuildingEstate,
			current: (p) => p.startsWith('/admin/properties')
		},
		{
			label: 'Users',
			href: '/admin/users',
			icon: IconUsers,
			current: (p) => p.startsWith('/admin/users')
		}
	];

	const tenantEntries: Entry[] = [
		{ label: 'Dashboard', href: '/', icon: IconDashboard, current: (p) => p === '/' },
		{
			label: 'Maintenance',
			href: '/maintenance',
			icon: IconTool,
			current: (p) => p.startsWith('/maintenance')
		},
		{
			label: 'Payment',
			href: '/payment',
			icon: IconCash,
			current: (p) => p.startsWith('/payment')
		},
		{
			label: 'Profile',
			href: '/profile',
			icon: IconUser,
			current: (p) => p.startsWith('/profile')
		},
		{
			label: 'Insurance',
			href: '/insurance',
			icon: IconClipboardList,
			current: (p) => p.startsWith('/insurance')
		},
		{ label: 'About Us', href: '/', icon: IconInfoCircle }
	];

	const entries = $derived(isAdmin ? adminEntries : tenantEntries);
</script>

<Navigation layout="sidebar" class="h-full w-full bg-transparent p-4">
	<Navigation.Content>
		<nav aria-label="Main" class="w-full">
			<Navigation.Menu>
				{#each entries as entry (entry.label)}
					{@const isCurrent = entry.current?.(page.url.pathname) ?? false}
					<Navigation.TriggerAnchor
						href={entry.href}
						aria-current={isCurrent ? 'page' : undefined}
						class={isCurrent ? 'preset-filled-primary-500' : 'hover:preset-tonal'}
						onclick={(event: MouseEvent) => onNavigate?.(event)}
					>
						<entry.icon class="size-5" aria-hidden="true" />
						<Navigation.TriggerText>{entry.label}</Navigation.TriggerText>
					</Navigation.TriggerAnchor>
				{/each}
			</Navigation.Menu>
		</nav>
	</Navigation.Content>
</Navigation>
