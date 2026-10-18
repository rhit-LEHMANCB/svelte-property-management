<script lang="ts">
	import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import AuthCard from '$lib/Components/Shell/AuthCard.svelte';
	import FormActions from '$lib/Components/Shell/FormActions.svelte';
	import Notice from '$lib/Components/Shell/Notice.svelte';
	import Field from '$lib/Components/Forms/Field.svelte';
	import { classifySignInError, SIGN_IN_MESSAGES } from '$lib/authErrors';
	import type { PageData } from './$types';

	let {
		data,
		// Set when the server rendered the form again after a failed sign-in without scripts.
		form = null
	}: { data: PageData; form?: { email?: string; error?: string } | null } = $props();

	// A failure in the browser; it replaces the server's message from an earlier post.
	let clientError = $state<string>();
	const error = $derived(clientError ?? form?.error);

	class SessionError extends Error {}

	async function signIn(email: string, password: string) {
		const credential = await signInWithEmailAndPassword(auth, email, password);

		const idToken = await credential.user.getIdToken();

		const response = await fetch('/api/signin', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ idToken })
		});
		if (!response.ok) {
			// Without the session cookie the server treats the user as signed out, so do the same here.
			await signOut(auth).catch(() => undefined);
			throw new SessionError();
		}
	}

	const failureMessage = (err: unknown) =>
		err instanceof SessionError
			? SIGN_IN_MESSAGES.unavailable
			: SIGN_IN_MESSAGES[classifySignInError(String((err as { code?: unknown })?.code ?? ''))];

	// The values are read from the form when it is submitted, not from bound variables, so text typed
	// before the page hydrated is never lost.
	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		clientError = undefined;
		const formData = new FormData(event.currentTarget as HTMLFormElement);

		await signIn(String(formData.get('email') ?? ''), String(formData.get('password') ?? ''))
			.then(() => goto('/'))
			.catch((err) => (clientError = failureMessage(err)));
	}
</script>

<div class="flex h-full items-center justify-center overflow-y-auto p-4">
	<AuthCard>
		<form method="POST" onsubmit={handleSubmit} class="space-y-4">
			<div>
				<h1 class="h3">Lehman Family LLC</h1>
				<p class="opacity-80">Please sign in to continue.</p>
			</div>
			{#if data.passwordChanged}
				<p class="font-semibold" role="status">Your password was changed. Please sign in.</p>
			{/if}
			<!-- Sign-in errors stay form-level, so they never reveal which of the two fields was wrong. -->
			<Field label="Email">
				{#snippet children({ attrs })}
					<!-- A value binding would make hydration reset text typed before it finished, so the input
						only gets a value when the server sent one back after a failed sign-in without scripts. -->
					{#if form?.email}
						<input
							{...attrs}
							name="email"
							value={form.email}
							autocomplete="username"
							class="input"
							title="Email"
							type="email"
							required
						/>
					{:else}
						<input
							{...attrs}
							name="email"
							autocomplete="username"
							class="input"
							title="Email"
							type="email"
							required
						/>
					{/if}
				{/snippet}
			</Field>
			<Field label="Password">
				{#snippet children({ attrs })}
					<input
						{...attrs}
						name="password"
						autocomplete="current-password"
						class="input"
						title="Password"
						type="password"
						required
					/>
				{/snippet}
			</Field>
			{#if error}
				<Notice tone="error"><p>{error}</p></Notice>
			{/if}
			<FormActions>
				<button type="submit" data-needs-hydration class="btn preset-filled-primary-500 w-full"
					>Sign in</button
				>
			</FormActions>
		</form>
		<p class="mt-4 text-center text-sm">
			<a href="/forgot" class="underline underline-offset-2">Forgot password?</a>
		</p>
	</AuthCard>
</div>
