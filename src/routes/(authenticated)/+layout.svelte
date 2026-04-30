<script lang="ts">
	import Navigation from '$lib/Components/Navigation/Navigation.svelte';
	import { goto } from '$app/navigation';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { IconLogout } from '@tabler/icons-svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';

	let { data, children }: { data: LayoutData; children?: Snippet } = $props();
	let user = $derived(data.user);

	let sidebarOpen = $state(false);

	function toggleSidebar(): void {
		sidebarOpen = !sidebarOpen;
	}

	async function signOutSSR() {
		const response = await fetch('/api/signin', { method: 'DELETE' });
		if (response.ok) {
			successToast('Successfully signed out');
			goto('/signin');
		} else {
			errorToast('There was a problem signing out.');
		}
	}
</script>

<div class="flex h-full">
	<!-- Sidebar for desktop -->
	<aside class="hidden lg:flex lg:w-64 bg-surface-500/5 flex-col">
		<Navigation isAdmin={user.permissions === 'admin'} />
	</aside>

	<!-- Main content area -->
	<div class="flex flex-col flex-1">
		<!-- Header -->
		<header>
			<div class="flex items-center justify-between px-4 py-2 shadow-xl bg-surface-100">
				<div class="flex items-center">
					<button
						class="lg:hidden btn btn-sm mr-4"
						onclick={toggleSidebar}
						aria-label="Toggle sidebar"
					>
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
				<div>
					<span>Welcome, {user.firstName ?? 'New User'}</span>
					<button
						type="button"
						onclick={signOutSSR}
						class="btn variant-filled-primary max-sm:hidden"
						>Sign out<IconLogout class="ml-2" /></button
					>
				</div>
			</div>
		</header>

		<!-- Main content -->
		<main class="flex-1 overflow-auto">
			{@render children?.()}
		</main>
	</div>

	<!-- Mobile sidebar drawer overlay -->
	{#if sidebarOpen}
		<div class="fixed inset-0 lg:hidden z-40">
			<div
				class="absolute inset-0 bg-black/50"
				onclick={() => (sidebarOpen = false)}
				onkeydown={(e) => e.key === 'Escape' && (sidebarOpen = false)}
				role="button"
				tabindex="0"
				aria-label="Close sidebar"
			></div>
			<aside class="absolute left-0 top-0 h-full w-[80vw] bg-surface-500/5 z-50">
				<div class="p-4">
					<button onclick={() => (sidebarOpen = false)} class="btn btn-sm mb-4">Close</button>
					<Navigation isAdmin={user.permissions === 'admin'} />
				</div>
			</aside>
		</div>
	{/if}
</div>
