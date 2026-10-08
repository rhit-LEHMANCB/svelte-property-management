<script lang="ts">
	import { Drawer, getDrawerStore, getToastStore } from '$lib/ui';
	import Navigation from '$lib/Components/Navigation/Navigation.svelte';
	import { goto } from '$app/navigation';
	import type { LayoutData } from './$types';
	import { IconLogout } from '@tabler/icons-svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';

	const drawerStore = getDrawerStore();
	const toastStore = getToastStore();
	export let data: LayoutData;

	$: ({ user } = data);

	function drawerOpen(): void {
		drawerStore.open();
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

<div class="grid h-full grid-cols-1 grid-rows-[auto_1fr] lg:grid-cols-[16rem_1fr]">
	<header
		class="bg-surface-100-900 col-span-full flex items-center justify-between gap-4 p-4 shadow-xl"
	>
		<div class="flex items-center">
			<button
				data-needs-hydration
				class="lg:hidden btn btn-sm mr-4"
				aria-label="Open menu"
				on:click={drawerOpen}
			>
				<span>
					<svg viewBox="0 0 100 80" class="fill-current w-4 h-4">
						<rect width="100" height="20" />
						<rect y="30" width="100" height="20" />
						<rect y="60" width="100" height="20" />
					</svg>
				</span>
			</button>
			<strong class="h3">LFR Manager</strong>
		</div>
		<div class="flex items-center gap-4">
			<span>Welcome, {user.firstName ?? 'New User'}</span>
			<button
				data-needs-hydration
				type="button"
				on:click={signOutSSR}
				class="btn preset-filled-primary-500 max-sm:hidden"
				>Sign out<IconLogout class="ml-2" /></button
			>
		</div>
	</header>
	<aside class="bg-surface-500/5 hidden overflow-y-auto lg:block">
		<Navigation isAdmin={user.permissions === 'admin'} />
	</aside>
	<!-- Router Slot -->
	<main class="overflow-y-auto">
		<slot />
	</main>
</div>
