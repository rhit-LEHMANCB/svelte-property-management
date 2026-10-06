<script lang="ts">
	import {
		AppBar,
		AppShell,
		Drawer,
		getDrawerStore,
		type DrawerSettings,
		getToastStore
	} from '@skeletonlabs/skeleton';
	import Navigation from '$lib/Components/Navigation/Navigation.svelte';
	import { goto } from '$app/navigation';
	import type { LayoutData } from './$types';
	import { IconLogout } from '@tabler/icons-svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';

	const drawerStore = getDrawerStore();
	const toastStore = getToastStore();
	export let data: LayoutData;

	$: ({ user } = data);

	const drawerSettings: DrawerSettings = {
		width: 'w-[80vw] md:w-[280px]',
		id: 'home'
	};

	function drawerOpen(): void {
		drawerStore.open(drawerSettings);
	}

	async function signOutSSR() {
		const response = await fetch('/api/signin', { method: 'DELETE' });
		if (response.ok) {
			successToast('Successfully signed out', toastStore);
			goto('/signin');
		} else {
			errorToast('There was a problem signing out.', toastStore);
		}
	}
</script>

<Drawer>
	<Navigation isAdmin={user.permissions === 'admin'} />
</Drawer>

<AppShell slotSidebarLeft="bg-surface-500/5 w-0 lg:w-64">
	<svelte:fragment slot="header">
		<AppBar shadow="shadow-xl">
			<svelte:fragment slot="lead">
				<div class="flex items-center">
					<button class="lg:hidden btn btn-sm mr-4" on:click={drawerOpen}>
						<span>
							<svg viewBox="0 0 100 80" class="fill-token w-4 h-4">
								<rect width="100" height="20" />
								<rect y="30" width="100" height="20" />
								<rect y="60" width="100" height="20" />
							</svg>
						</span>
					</button>
					<strong class="h3">LFR Manager</strong>
				</div>
			</svelte:fragment>
			<svelte:fragment slot="trail">
				<span>Welcome, {user.firstName ?? 'New User'}</span>
				<button type="button" on:click={signOutSSR} class="btn variant-filled-primary max-sm:hidden"
					>Sign out<IconLogout class="ml-2" /></button
				>
			</svelte:fragment>
		</AppBar>
	</svelte:fragment>
	<svelte:fragment slot="sidebarLeft">
		<Navigation isAdmin={user.permissions === 'admin'} />
	</svelte:fragment>
	<!-- (pageHeader) -->
	<!-- Router Slot -->
	<slot />
</AppShell>
