<script lang="ts">
	import AuthCard from '$lib/Components/Shell/AuthCard.svelte';
	import FormActions from '$lib/Components/Shell/FormActions.svelte';
	import Notice from '$lib/Components/Shell/Notice.svelte';
	import Field from '$lib/Components/Forms/Field.svelte';

	// Set after a submit: the request was taken, or the email was invalid or could not be sent.
	let {
		form = null
	}: { form?: { requested?: boolean; email?: string; error?: string; field?: 'email' } | null } =
		$props();
</script>

<div class="flex h-full items-center justify-center overflow-y-auto p-4">
	<AuthCard>
		<h1 class="h3">Lehman Family LLC</h1>
		{#if form?.requested}
			<p class="mt-3" role="status">
				If an account exists for that email, we've sent a reset link.
			</p>
		{:else}
			<p class="opacity-80">Enter your email and we'll send you a link to reset your password.</p>
			<!-- No client script: the form posts to the server, so it works before hydration. -->
			<form method="POST" class="mt-4 space-y-4">
				<Field
					label="Email"
					errors={form?.field === 'email' && form.error ? [form.error] : undefined}
				>
					{#snippet children({ attrs, invalid })}
						<input
							{...attrs}
							name="email"
							value={form?.email ?? ''}
							autocomplete="username"
							class="input"
							class:input-error={invalid}
							title="Email"
							type="email"
							required
						/>
					{/snippet}
				</Field>
				{#if form?.error && form.field !== 'email'}
					<Notice tone="error"><p>{form.error}</p></Notice>
				{/if}
				<FormActions>
					<button type="submit" class="btn preset-filled-primary-500 w-full">Send reset link</button
					>
				</FormActions>
			</form>
		{/if}
		<p class="mt-4 text-center text-sm">
			<a href="/signin" class="underline underline-offset-2">Back to sign in</a>
		</p>
	</AuthCard>
</div>
