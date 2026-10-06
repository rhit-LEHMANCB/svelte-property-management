import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

// Deliberately does not use the SvelteKit plugin: the unit and handler tests only
// need the aliases below, which keeps them independent of the SvelteKit version.
export default defineConfig({
	resolve: {
		// sveltekit-superforms exposes its server entry only under the `svelte` condition.
		conditions: ['svelte'],
		alias: [
			{ find: '$app/env/private', replacement: path('./tests/fixtures/env-private.ts') },
			{ find: '$app/env/public', replacement: path('./tests/fixtures/env-public.ts') },
			{ find: '$app/server', replacement: path('./tests/fixtures/app-server.ts') },
			{ find: /^#lib\/(.*)$/, replacement: path('./src/lib') + '/$1' },
			{ find: '#lib', replacement: path('./src/lib') }
		]
	},
	test: {
		environment: 'node',
		include: ['tests/unit/**/*.test.ts', 'tests/handlers/**/*.test.ts'],
		server: { deps: { inline: ['sveltekit-superforms'] } },
		setupFiles: ['./tests/helpers/setup.ts']
	}
});
