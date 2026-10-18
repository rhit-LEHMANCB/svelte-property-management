<script lang="ts">
	import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
	import PageBody from '$lib/Components/Shell/PageBody.svelte';
	import Card from '$lib/Components/Shell/Card.svelte';
	import FormActions from '$lib/Components/Shell/FormActions.svelte';

	let { data }: { data: { bank: boolean } } = $props();
</script>

<PageBody>
	<PageHeader
		title="Payment"
		breadcrumbs={[{ label: 'Payment', href: '/payment' }, { label: 'Success' }]}
	/>
	<Card title="Thank you for your payment">
		{#if data.bank}
			<p>
				Your bank payment was received by Stripe. Bank payments take a few business days to
				complete. Until then it shows as processing on your payment page, and no late fee is added
				while it processes.
			</p>
		{:else}
			<p>Your payment was received by Stripe. It can take a minute to appear in your balance.</p>
		{/if}
		<FormActions>
			<a class="btn preset-filled-primary-500" href="/payment">Back to payments</a>
		</FormActions>
	</Card>
</PageBody>
