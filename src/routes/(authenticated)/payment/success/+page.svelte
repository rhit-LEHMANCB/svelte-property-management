<script lang="ts">
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';

	export let data: { bank: boolean };
</script>

<div class="space-y-4 p-4 sm:p-6">
	<PageHeader title="Payment" />
	<div class="card bg-surface-100-900 flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
		<h2 class="h4">Thank you for your payment</h2>
		{#if data.bank}
			<p>
				Your bank payment was received by Stripe. Bank payments take a few business days to
				complete. Until then it shows as processing on your payment page, and no late fee is added
				while it processes.
			</p>
		{:else}
			<p>Your payment was received by Stripe. It can take a minute to appear in your balance.</p>
		{/if}
		<div>
			<a class="btn preset-filled-primary-500" href="/payment">Back to payments</a>
		</div>
	</div>
</div>
