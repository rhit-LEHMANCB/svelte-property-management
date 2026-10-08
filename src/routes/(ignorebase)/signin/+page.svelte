<script lang="ts">
	import { signInWithEmailAndPassword } from 'firebase/auth';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import { errorToast } from '$lib/Hooks/toasts';
	import { getToastStore } from '$lib/ui';

	// Set when the server rendered the form again after a failed sign-in without scripts.
	export let form: { email?: string; error?: string } | null = null;

	const toastStore = getToastStore();

	async function signIn(email: string, password: string) {
		const credential = await signInWithEmailAndPassword(auth, email, password);

		const idToken = await credential.user.getIdToken();

		await fetch('/api/signin', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ idToken })
		});
	}

	// The values are read from the form when it is submitted, not from bound variables, so text typed
	// before the page hydrated is never lost.
	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const data = new FormData(event.currentTarget as HTMLFormElement);

		await signIn(String(data.get('email') ?? ''), String(data.get('password') ?? ''))
			.then(() => goto('/'))
			.catch(() => errorToast('Your email or password is incorrect.', toastStore));
	}
</script>

<div class="h-screen flex items-center justify-center">
	<form method="POST" on:submit={handleSubmit} class="card p-8">
		<strong class="h3">Lehman Family LLC</strong>
		<p>Please sign in to continue.</p>
		<div class="grid grid-cols-1 gap-2 mt-2">
			<!-- A value binding would make hydration reset text typed before it finished, so the input only
				gets a value when the server sent one back after a failed sign-in without scripts. -->
			{#if form?.email}
				<label class="label"
					><span>Email</span><input
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
					><span>Email</span><input
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
				><span>Password</span><input
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
			<p class="text-error-500 mt-2" role="alert">{form.error}</p>
		{/if}
		<div>
			<button type="submit" data-needs-hydration class="btn preset-filled-primary-500 mt-5"
				>Sign in</button
			>
		</div>
	</form>
</div>
