<script lang="ts">
	import { onMount } from 'svelte';
	import { IconMoon, IconSun } from '@tabler/icons-svelte';
	import { currentMode, setMode, type ColorMode } from '$lib/theme';

	// The server cannot know the mode; the button is inert (data-needs-hydration) until mounted.
	let mode = $state<ColorMode>('light');

	onMount(() => {
		mode = currentMode();
	});

	function toggle() {
		mode = mode === 'dark' ? 'light' : 'dark';
		setMode(mode);
	}
</script>

<button
	data-needs-hydration
	type="button"
	class="btn-icon hover:preset-tonal"
	aria-label="Dark mode"
	aria-pressed={mode === 'dark'}
	title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	onclick={toggle}
>
	{#if mode === 'dark'}<IconMoon />{:else}<IconSun />{/if}
</button>
