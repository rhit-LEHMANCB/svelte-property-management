import { readFileSync } from 'node:fs';
export const STATE =
	'/tmp/claude-0/-home-user-svelte-property-management/584e15ae-a96d-5796-bd83-2a82151ea492/scratchpad/qa-state.json';
export const state = () => JSON.parse(readFileSync(STATE, 'utf8')) as { propertyId: string };
