import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

const config = {
	// Dark mode handled via the class method
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {}
	},
	plugins: [forms]
} satisfies Config;

export default config;
