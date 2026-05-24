<script lang="ts">
	import { Toaster, createToaster } from '@skeletonlabs/skeleton-svelte';
	import NavComponent from '$lib/Components/Navigation/Navigation.svelte';
	import { goto } from '$app/navigation';
	import type { LayoutData } from './$types';
	import { IconLogout } from '@tabler/icons-svelte';
	import { errorToast, successToast, setToaster } from '$lib/Hooks/toasts';
	import { onMount } from 'svelte';

	export let data: LayoutData;

	$: ({ user } = data);

	const toaster = createToaster({
		placement: 'bottom-end'
	});

	onMount(() => {
		setToaster(toaster);
	});

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

<div class="flex h-screen flex-col">
	<header class="bg-surface-100-900 shadow-xl">
		<div class="flex items-center justify-between px-4 py-3">
			<div class="flex items-center gap-4">
				<button class="lg:hidden btn btn-sm" aria-label="Menu">
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
			<div class="flex items-center gap-4">
				<span>Welcome, {user.firstName ?? 'New User'}</span>
				<button
					type="button"
					on:click={signOutSSR}
					class="btn preset-filled-primary-500 max-sm:hidden"
				>
					Sign out<IconLogout class="ml-2" />
				</button>
			</div>
		</div>
	</header>

	<div class="flex flex-1 overflow-hidden">
		<aside class="bg-surface-500/5 w-0 lg:w-64 overflow-y-auto">
			<NavComponent isAdmin={user.permissions === 'admin'} />
		</aside>

		<main class="flex-1 overflow-y-auto p-4">
			<slot />
		</main>
	</div>
</div>

<Toaster {toaster} />
