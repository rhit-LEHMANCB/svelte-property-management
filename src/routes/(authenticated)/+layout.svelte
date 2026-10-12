<script lang="ts">
	import { AppBar, Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { getDrawerStore, getToastStore } from '$lib/ui';
	import Navigation from '$lib/Components/Navigation/Navigation.svelte';
	import ThemeToggle from '$lib/Components/Shell/ThemeToggle.svelte';
	import PagePlaceholder from '$lib/Components/Shell/PagePlaceholder.svelte';
	import { goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import type { LayoutData } from './$types';
	import { IconLogout, IconMenu2, IconX } from '@tabler/icons-svelte';
	import { errorToast, successToast } from '$lib/Hooks/toasts';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const drawerStore = getDrawerStore();
	const toastStore = getToastStore();

	const user = $derived(data.user);
	const isAdmin = $derived(user.permissions === 'admin');

	// Placeholders replace the page only when a navigation to another page takes a moment, so quick
	// navigations do not flash.
	let showPlaceholder = $state(false);
	$effect(() => {
		const leaving = navigating.to && navigating.to.url.pathname !== navigating.from?.url.pathname;
		if (!leaving) {
			showPlaceholder = false;
			return;
		}
		const timer = setTimeout(() => (showPlaceholder = true), 150);
		return () => clearTimeout(timer);
	});

	// The drawer is for narrow screens; close it when the window widens past the sidebar breakpoint,
	// so an invisible modal never keeps the page hidden and scroll-locked.
	$effect(() => {
		const wide = matchMedia('(min-width: 64rem)');
		const close = () => wide.matches && drawerStore.close();
		wide.addEventListener('change', close);
		return () => wide.removeEventListener('change', close);
	});

	async function signOutSSR() {
		const response = await fetch('/api/signin', { method: 'DELETE' });
		if (response.ok) {
			drawerStore.close();
			successToast('Successfully signed out', toastStore);
			goto('/signin');
		} else {
			errorToast('There was a problem signing out.', toastStore);
		}
	}
</script>

<div class="grid h-full grid-cols-1 grid-rows-[auto_1fr] lg:grid-cols-[16rem_1fr]">
	<AppBar class="bg-surface-100-900 border-surface-200-800 col-span-full border-b p-3 sm:p-4">
		<AppBar.Toolbar class="grid-cols-[auto_1fr_auto] items-center gap-2">
			<div>
				<button
					data-needs-hydration
					type="button"
					class="btn-icon hover:preset-tonal lg:hidden"
					aria-label="Open menu"
					aria-expanded={$drawerStore}
					onclick={() => drawerStore.open()}
				>
					<IconMenu2 />
				</button>
			</div>
			<div>
				<strong class="h5 sm:h4">Lehman Family LLC</strong>
			</div>
			<div class="flex items-center gap-2 sm:gap-4">
				<span class="hidden md:inline">Welcome, {user.firstName ?? 'New User'}</span>
				<ThemeToggle />
				<button
					data-needs-hydration
					type="button"
					onclick={signOutSSR}
					class="btn preset-filled-primary-500 max-sm:hidden"
					>Sign out<IconLogout class="size-5" aria-hidden="true" /></button
				>
			</div>
		</AppBar.Toolbar>
	</AppBar>
	<aside class="bg-surface-100-900 border-surface-200-800 hidden overflow-y-auto border-r lg:block">
		<Navigation {isAdmin} />
	</aside>
	<main class="overflow-y-auto" aria-busy={showPlaceholder}>
		{#if showPlaceholder}
			<PagePlaceholder />
		{:else}
			{@render children()}
		{/if}
	</main>
</div>

<!-- Phone navigation: a modal drawer that traps focus, closes on Escape and returns focus. -->
<Dialog open={$drawerStore} onOpenChange={(details) => drawerStore.set(details.open)}>
	<Portal>
		<Dialog.Backdrop class="bg-surface-950/60 fixed inset-0 z-40 lg:hidden" />
		<Dialog.Positioner class="fixed inset-y-0 left-0 z-40 flex lg:hidden">
			<Dialog.Content class="bg-surface-50-950 flex h-full w-[min(80vw,18rem)] flex-col shadow-xl">
				<div class="flex items-center justify-between p-4 pb-0">
					<Dialog.Title>
						{#snippet element(attributes)}
							<h2 {...attributes} class="h5">Menu</h2>
						{/snippet}
					</Dialog.Title>
					<Dialog.CloseTrigger class="btn-icon hover:preset-tonal" aria-label="Close menu">
						<IconX />
					</Dialog.CloseTrigger>
				</div>
				<div class="flex-auto overflow-y-auto">
					<Navigation {isAdmin} onNavigate={() => drawerStore.close()} />
				</div>
				<div class="p-4 sm:hidden">
					<button type="button" onclick={signOutSSR} class="btn preset-filled-primary-500 w-full"
						>Sign out<IconLogout class="size-5" aria-hidden="true" /></button
					>
				</div>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
