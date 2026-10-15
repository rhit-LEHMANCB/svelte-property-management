<script lang="ts">
	// Set after a submit: the request was taken, or the email was invalid or could not be sent.
	export let form: { requested?: boolean; email?: string; error?: string } | null = null;
</script>

<div class="flex h-full items-center justify-center overflow-y-auto p-4">
	<div class="card bg-surface-100-900 w-full max-w-sm p-6 shadow-xl sm:p-8">
		<h1 class="h3">Lehman Family LLC</h1>
		{#if form?.requested}
			<p class="mt-3" role="status">
				If an account exists for that email, we've sent a reset link.
			</p>
		{:else}
			<p class="opacity-80">Enter your email and we'll send you a link to reset your password.</p>
			<!-- No client script: the form posts to the server, so it works before hydration. -->
			<form method="POST" class="mt-4 grid grid-cols-1 gap-3">
				<label class="label"
					><span class="label-text">Email</span><input
						name="email"
						value={form?.email ?? ''}
						autocomplete="username"
						class="input"
						title="Email"
						type="email"
						required
					/></label
				>
				{#if form?.error}
					<p class="text-error-700-300" role="alert">{form.error}</p>
				{/if}
				<button type="submit" class="btn preset-filled-primary-500 mt-3 w-full"
					>Send reset link</button
				>
			</form>
		{/if}
		<p class="mt-4 text-center text-sm">
			<a href="/signin" class="underline underline-offset-2">Back to sign in</a>
		</p>
	</div>
</div>
