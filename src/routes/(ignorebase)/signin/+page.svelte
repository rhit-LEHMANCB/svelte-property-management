<script lang="ts">
	import { signInWithEmailAndPassword } from 'firebase/auth';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import { errorToast } from '$lib/Hooks/toasts';

	let email: string;
	let password: string;
	let loginError: string;

	$: (email, password, (loginError = ''));
	$: if (loginError) {
		errorToast('Your email or password is incorrect.');
	}

	async function signIn() {
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

	async function handleSignIn() {
		await signIn()
			.then(() => goto('/'))
			.catch((error) => (loginError = error.code));
	}

	function onKeyDown(e: KeyboardEvent) {
		switch (e.code) {
			case 'Enter':
				handleSignIn();
				break;
		}
	}
</script>

<div class="h-screen flex items-center justify-center">
	<div class="card p-8">
		<strong class="h3">Lehman Family Realty</strong>
		<p>Please sign in to continue.</p>
		<div class="grid grid-cols-1 gap-2 mt-2">
			<label class="label"
				><span>Email</span><input
					bind:value={email}
					class="input"
					title="Email"
					type="email"
				/></label
			>
			<label class="label"
				><span>Password</span><input
					bind:value={password}
					class="input"
					title="Password"
					type="password"
				/></label
			>
		</div>
		<div>
			<button type="button" onclick={handleSignIn} class="btn variant-filled-primary mt-5"
				>Sign in</button
			>
		</div>
	</div>
</div>

<svelte:window onkeydown={onKeyDown} />
