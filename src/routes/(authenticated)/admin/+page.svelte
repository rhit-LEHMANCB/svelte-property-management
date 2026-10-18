<script lang="ts">
	import { IconBuildingEstate, IconTool, IconUsers } from '@tabler/icons-svelte';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import PageBody from '$lib/Components/Shell/PageBody.svelte';

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
	<ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		{#each links as link (link.href)}
			<li>
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
			</li>
		{/each}
	</ul>
</PageBody>
