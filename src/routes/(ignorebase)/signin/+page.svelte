<script lang="ts">
	import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import { errorToast } from '$lib/Hooks/toasts';
	import { getToastStore } from '$lib/ui';
	import { classifySignInError, SIGN_IN_MESSAGES } from '$lib/authErrors';
	import type { PageData } from './$types';

	export let data: PageData;
	// Set when the server rendered the form again after a failed sign-in without scripts.
	export let form: { email?: string; error?: string } | null = null;

	const toastStore = getToastStore();

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
		const formData = new FormData(event.currentTarget as HTMLFormElement);

		await signIn(String(formData.get('email') ?? ''), String(formData.get('password') ?? ''))
			.then(() => goto('/'))
			.catch((err) => errorToast(failureMessage(err), toastStore));
	}
</script>

<div class="flex h-full items-center justify-center overflow-y-auto p-4">
	<form
		method="POST"
		on:submit={handleSubmit}
		class="card bg-surface-100-900 w-full max-w-sm p-6 shadow-xl sm:p-8"
	>
		<h1 class="h3">Lehman Family LLC</h1>
		<p class="opacity-80">Please sign in to continue.</p>
		{#if data.passwordChanged}
			<p class="mt-3 font-semibold" role="status">Your password was changed. Please sign in.</p>
		{/if}
		<div class="mt-4 grid grid-cols-1 gap-3">
			<!-- A value binding would make hydration reset text typed before it finished, so the input only
				gets a value when the server sent one back after a failed sign-in without scripts. -->
			{#if form?.email}
				<label class="label"
					><span class="label-text">Email</span><input
						name="email"
						value={form.email}
						autocomplete="username"
						class="input"
						title="Email"
						type="email"
						required
					/></label
				>
			{:else}
				<label class="label"
					><span class="label-text">Email</span><input
						name="email"
						autocomplete="username"
						class="input"
						title="Email"
						type="email"
						required
					/></label
				>
			{/if}
			<label class="label"
				><span class="label-text">Password</span><input
					name="password"
					autocomplete="current-password"
					class="input"
					title="Password"
					type="password"
					required
				/></label
			>
		</div>
		{#if form?.error}
			<p class="text-error-700-300 mt-3" role="alert">{form.error}</p>
		{/if}
		<div>
			<button type="submit" data-needs-hydration class="btn preset-filled-primary-500 mt-6 w-full"
				>Sign in</button
			>
		</div>
		<p class="mt-4 text-center text-sm">
			<a href="/forgot" class="underline underline-offset-2">Forgot password?</a>
		</p>
	</form>
</div>
