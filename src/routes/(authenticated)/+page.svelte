<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
</script>

{#if data.user.permissions !== 'admin' && !data.userProperty}
	<div class="card m-5 p-5" role="status">
		<strong>No property is assigned to your account yet.</strong>
		<p>Please contact your property manager. You can still update your profile.</p>
	</div>
{:else}
	<strong>Manager page</strong>
{/if}
