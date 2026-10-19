<script lang="ts">
	import { IconBuildingEstate, IconTool, IconUsers } from '@tabler/icons-svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import PageBody from '$lib/Components/Shell/PageBody.svelte';
	import Card from '$lib/Components/Shell/Card.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Only rows with something to do; a count of 0 is left out.
	const attention = $derived(
		[
			{
				count: data.attention.openRequests,
				one: 'open maintenance request',
				many: 'open maintenance requests',
				href: '/admin/maintenance'
			},
			{
				count: data.attention.depositsToSettle,
				one: 'deposit to settle',
				many: 'deposits to settle',
				href: '/admin/properties'
			},
			{
				count: data.attention.failedAutopay,
				one: 'autopay charge failed',
				many: 'autopay charges failed',
				href: '/admin/properties'
			}
		].filter((row) => row.count > 0)
	);

	const links = [
		{
			href: '/admin/properties',
			label: 'Properties',
			text: 'Add and edit properties, photos and tenants.',
			icon: IconBuildingEstate
		},
		{
			href: '/admin/users',
			label: 'Users',
			text: 'Invite tenants and review their details.',
			icon: IconUsers
		},
		{
			href: '/admin/maintenance',
			label: 'Maintenance',
			text: 'Review and close maintenance requests.',
			icon: IconTool
		}
	];
</script>

<PageBody>
	<PageHeader title="Admin home" />
	<Card as="section" title="Needs attention" aria-label="Needs attention">
		{#if attention.length === 0}
			<p class="opacity-80">Nothing needs attention right now.</p>
		{:else}
			<ul class="space-y-2">
				{#each attention as row (row.one)}
					<li
						class="bg-surface-50-950 rounded-container flex flex-wrap items-center justify-between gap-3 px-4 py-3"
					>
						<span><strong>{row.count}</strong> {row.count === 1 ? row.one : row.many}</span>
						<a class="btn btn-sm preset-tonal" href={row.href}>Review</a>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>
	<nav aria-label="Admin sections" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		{#each links as link (link.href)}
			<div>
				<!-- A whole-card link, so it repeats the shared card padding rather than using Card. -->
				<a
					href={link.href}
					class="card bg-surface-100-900 flex h-full items-start gap-4 p-4 sm:p-6"
					data-card
				>
					<link.icon size={28} class="text-primary-700-300 shrink-0" aria-hidden="true" />
					<span class="flex flex-col gap-1">
						<span class="h5">{link.label}</span>
						<span class="opacity-80">{link.text}</span>
					</span>
				</a>
			</div>
		{/each}
	</nav>
</PageBody>
