import { describe, expect, it } from 'vitest';
import { FB_CLIENT_EMAIL } from '$env/static/private';
import { PUBLIC_FRONTEND_URL } from '$env/static/public';

describe('test tooling', () => {
	it('resolves the env fixtures through the $env aliases', () => {
		expect(FB_CLIENT_EMAIL).toContain('demo-lehman-realty');
		expect(PUBLIC_FRONTEND_URL).toBe('http://localhost:5173');
	});
});
