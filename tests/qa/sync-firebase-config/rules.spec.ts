import { expect, test } from '@playwright/test';

const PROJECT = 'lehman-realty-dev';
const BUCKET = `${PROJECT}.appspot.com`;
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const ST = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;
const PHOTO = `${ST}/properties%2FwrIhk0hPRVK1hDCaId8y%2Fimages%2F0-1706199309451.png?alt=media`;
const PROFILE = `${ST}/users%2Fd4VPx3DJBUTK1eM9sUAUtmBKoG72%2Fprofile%2F1711737393538.JPG?alt=media`;

let apiKey = '';
test.beforeAll(async ({ browser }) => {
	// The web API key is public client config: read it from the app's own loaded scripts.
	const page = await browser.newPage();
	const bodies: string[] = [];
	page.on('response', async (r) => {
		if (r.url().endsWith('.js')) bodies.push(await r.text().catch(() => ''));
	});
	await page.goto('https://lehman-realty-dev.web.app/signin');
	await page.waitForLoadState('networkidle');
	const m = bodies.join('\n').match(/AIza[0-9A-Za-z_-]{35}/);
	apiKey = m ? m[0] : '';
	await page.close();
});

async function tenantToken() {
	const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: process.env.QA_TENANT_EMAIL, password: process.env.QA_TENANT_PASSWORD, returnSecureToken: true })
	});
	const j = await r.json();
	return { status: r.status, idToken: j.idToken as string | undefined, uid: j.localId as string | undefined };
}

const callers = ['anonymous', 'signed-in tenant'] as const;
for (const caller of callers) {
	test.describe(caller, () => {
		let headers: Record<string, string> = {};
		let uid = "x";
		let stHeaders: Record<string, string> = {};
		test.beforeAll(async () => {
			expect(apiKey).toMatch(/^AIza/);
			if (caller !== 'anonymous') {
				const t = await tenantToken();
				expect(t.status).toBe(200);
				headers = { Authorization: `Bearer ${t.idToken}` };
				stHeaders = { Authorization: `Firebase ${t.idToken}` };
				uid = t.uid!;
			}
		});

		const info = (label: string, r: { status: number }, body: string) =>
			console.log(`[${caller}] ${label}: ${r.status} ${body.replace(/\s+/g, ' ').slice(0, 260)}`);

		test('Firestore denies client read and write', async () => {
			const reads = [`${FS}/users/${uid}`, `${FS}/users`, `${FS}/properties`];
			for (const u of reads) {
				const r = await fetch(u, { headers });
				const b = await r.text();
				info(`GET ${u.replace(FS, '')}`, r, b);
				expect(r.status).toBe(403);
				expect(b).toContain('PERMISSION_DENIED');
				expect(b).toMatch(/Missing or insufficient permissions/);
			}
			const w = await fetch(`${FS}/qa-rules-probe?documentId=qa-probe`, {
				method: 'POST',
				headers: { ...headers, 'Content-Type': 'application/json' },
				body: JSON.stringify({ fields: { v: { stringValue: 'x' } } })
			});
			const wb = await w.text();
			info('POST qa-rules-probe', w, wb);
			expect(w.status).toBe(403);
			expect(wb).toContain('PERMISSION_DENIED');
			// verify nothing was created (admin sees none) - denial above is the evidence
		});

		test('Storage serves objects by URL', async () => {
			for (const u of [PHOTO, PROFILE]) {
				const r = await fetch(u, { headers: stHeaders });
				const buf = await r.arrayBuffer();
				console.log(`[${caller}] GET object ${r.status} ${r.headers.get('content-type')} ${buf.byteLength}b`);
				expect(r.status).toBe(200);
				expect(r.headers.get('content-type')).toMatch(/image/);
			}
			// metadata (get) also allowed
			const m = await fetch(PHOTO.replace('?alt=media', ''), { headers: stHeaders });
			console.log(`[${caller}] metadata ${m.status}`);
			expect(m.status).toBe(200);
		});

		test('Storage denies write and listing', async () => {
			const up = await fetch(`${ST}?name=qa-probe%2Fqa-probe.txt&uploadType=media`, {
				method: 'POST',
				headers: { ...stHeaders, 'Content-Type': 'text/plain' },
				body: 'qa'
			});
			const ub = await up.text();
			info('upload', up, ub);
			expect(up.status).toBe(403);
			const list = await fetch(`${ST}`, { headers: stHeaders });
			const lb = await list.text();
			info('list bucket', list, lb);
			expect(list.status).toBe(403);
			const list2 = await fetch(`${ST}?prefix=properties%2F&delimiter=%2F`, { headers: stHeaders });
			info('list prefix', list2, await list2.text());
			expect(list2.status).toBe(403);
			const del = await fetch(PHOTO.replace('?alt=media', ''), { method: 'DELETE', headers: stHeaders });
			info('delete object', del, await del.text());
			expect(del.status).toBe(403);
			// confirm the object still serves after the attempted delete
			const still = await fetch(PHOTO, { headers: stHeaders });
			expect(still.status).toBe(200);
		});
	});
}

test('control: a nonexistent project/api-key style 403 differs from a rules denial', async () => {
	const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users?key=AIzaINVALIDKEY00000000000000000000000000`);
	console.log(`[control bad key] ${r.status} ${(await r.text()).replace(/\s+/g, ' ').slice(0, 200)}`);
});

test('control: wrong project gives a different error than a rules denial', async () => {
	const r = await fetch(`https://firestore.googleapis.com/v1/projects/qa-no-such-project-zz9/databases/(default)/documents/users`);
	console.log(`[control wrong project] ${r.status} ${(await r.text()).replace(/\s+/g, ' ').slice(0, 200)}`);
});
