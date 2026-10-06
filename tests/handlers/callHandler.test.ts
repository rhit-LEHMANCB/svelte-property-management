import http from 'node:http';
import https from 'node:https';
import { describe, expect, it } from 'vitest';
import { error, json, redirect } from '@sveltejs/kit';
import { adminDB } from '$lib/server/admin';
import { call } from '../helpers/callHandler';
import { services } from '../helpers/services';

describe('handler test infrastructure: call()', () => {
	it('returns the status and parsed JSON of a returned Response', async () => {
		const result = await call(async () => json({ ok: true }, { status: 201 }));
		expect(result).toMatchObject({ status: 201, json: { ok: true } });
	});

	it('reports a thrown error() as its status and message', async () => {
		const result = await call(async () => {
			throw error(401, 'nope');
		});
		expect(result).toMatchObject({ status: 401, error: 'nope' });
	});

	it('reports a thrown redirect() as its status and location', async () => {
		const result = await call(async () => {
			throw redirect(303, '/signin');
		});
		expect(result).toMatchObject({ status: 303, redirect: '/signin' });
	});

	it('passes locals, params, a JSON body and cookies to the handler', async () => {
		const seen: Record<string, unknown> = {};
		await call(
			async (event) => {
				seen.userID = event.locals.userID;
				seen.id = event.params.id;
				seen.body = await event.request.json();
				seen.cookie = event.cookies.get('a');
				return new Response();
			},
			{ userID: 'u1', params: { id: 'p1' }, body: { x: 1 }, cookies: { a: 'b' } }
		);
		expect(seen).toEqual({ userID: 'u1', id: 'p1', body: { x: 1 }, cookie: 'b' });
	});

	it('returns a non-Response value as data, as page loads and form actions do', async () => {
		const result = await call(async () => ({ hello: 'world' }));
		expect(result).toMatchObject({ status: 200, data: { hello: 'world' } });
	});

	it('defaults to an anonymous caller', async () => {
		const result = await call(async (event) => json({ id: event.locals.userID }));
		expect(result.json).toEqual({ id: null });
	});
});

describe('handler test infrastructure: service doubles', () => {
	it('replaces the server admin module with the in-memory fake', async () => {
		expect(adminDB).toBe(services.db);
		await adminDB.collection('users').doc('u1').set({ a: 1 });
		expect(services.db.peek('users/u1')).toEqual({ a: 1 });
	});

	it('resets data between tests (the previous test wrote users/u1)', () => {
		expect(services.db.peek('users/u1')).toBeUndefined();
	});

	it('Scenario: Hermetic run: any attempt to use the network fails the test', async () => {
		expect(() => fetch('https://api.stripe.com/v1/charges')).toThrow(/Network access is blocked/);
		expect(() => http.request('http://example.com')).toThrow(/Network access is blocked/);
		expect(() => https.get('https://example.com')).toThrow(/Network access is blocked/);
	});
});
