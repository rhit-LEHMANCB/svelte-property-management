import { createRequire } from 'module';
import { join } from 'path';

// 1. Import the Skeleton plugin
import { skeleton } from '@skeletonlabs/tw-plugin';
import { myCustomTheme } from './theme.js';
import forms from '@tailwindcss/forms';

// This config is plain JavaScript so Tailwind 3 loads it without its bundled TypeScript loader,
// which fails on Node 22 and later.
const require = createRequire(import.meta.url);

/** @type {import('tailwindcss').Config} */
const config = {
	// 2. Opt for dark mode to be handled via the class method
	darkMode: 'class',
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		// 3. Append the path to the Skeleton package
		join(require.resolve('@skeletonlabs/skeleton'), '../**/*.{html,js,svelte,ts}')
	],
	theme: {
		extend: {}
	},
	plugins: [
		forms,
		skeleton({
			themes: {
				preset: ['hamlindigo'],
				custom: [myCustomTheme]
			}
		})
	]
};

export default config;
