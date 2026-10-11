<script lang="ts">
	import type { PageData } from './$types';
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title="Dashboard" />
	{#if data.user.permissions !== 'admin' && !data.userProperty}
		<div class="card preset-tonal-warning p-5" role="status">
			<strong>No property is assigned to your account yet.</strong>
			<p>Please contact your property manager. You can still update your profile.</p>
		</div>
	{/if}
</div>
