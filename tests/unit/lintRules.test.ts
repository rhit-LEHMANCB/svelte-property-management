import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

// Lints through the project's own eslint.config.js, so dropping the rule from it fails this test.
const eslint = new ESLint({ cwd: process.cwd() });
const lint = async (code: string) =>
	(await eslint.lintText(code, { filePath: 'src/lib/Fixture.svelte' }))[0].messages;

describe('Svelte 4 event directives', () => {
	it('are rejected with a pointer to the Svelte 5 form', async () => {
		const messages = await lint('<button on:click={() => {}}>Go</button>\n');
		expect(messages).toEqual([
			expect.objectContaining({
				ruleId: 'no-restricted-syntax',
				line: 1,
				message: 'Use Svelte 5 event attributes (onclick), not on:click.'
			})
		]);
	});

	it('also catches directives with modifiers', async () => {
		const messages = await lint('<form on:submit|preventDefault={() => {}}></form>\n');
		expect(messages.map((m) => m.ruleId)).toEqual(['no-restricted-syntax']);
	});

	it('allow event attributes', async () => {
		expect(await lint('<button onclick={() => {}}>Go</button>\n')).toEqual([]);
	});
});
