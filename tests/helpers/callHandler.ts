// SvelteKit 1 does not export isHttpError or isRedirect, so errors thrown by error() and
// redirect() are recognized by their shape, which is the same in later major versions.
type ThrownHttpError = { status: number; body: { message: string } };
type ThrownRedirect = { status: number; location: string };
const isHttpError = (e: unknown): e is ThrownHttpError =>
	typeof e === 'object' &&
	e !== null &&
	typeof (e as ThrownHttpError).status === 'number' &&
	typeof (e as ThrownHttpError).body === 'object';
const isRedirect = (e: unknown): e is ThrownRedirect =>
	typeof e === 'object' &&
	e !== null &&
	typeof (e as ThrownRedirect).status === 'number' &&
	typeof (e as ThrownRedirect).location === 'string';

/** A recording stand-in for SvelteKit's cookies API. */
export function makeCookies(initial: Record<string, string> = {}) {
	const jar = new Map(Object.entries(initial));
	const calls = {
		set: [] as { name: string; value: string; options: Record<string, unknown> }[],
		deleted: [] as { name: string; options: Record<string, unknown> }[]
	};
	return {
		get: (name: string) => jar.get(name),
		getAll: () => [...jar].map(([name, value]) => ({ name, value })),
		set: (name: string, value: string, options: Record<string, unknown> = {}) => {
			jar.set(name, value);
			calls.set.push({ name, value, options });
		},
		delete: (name: string, options: Record<string, unknown> = {}) => {
			jar.delete(name);
			calls.deleted.push({ name, options });
		},
		serialize: () => '',
		calls
	};
}

export type CallOptions = {
	/** Signed-in user id, or null for an anonymous caller. */
	userID?: string | null;
	params?: Record<string, string>;
	method?: string;
	url?: string;
	/** Sent as a JSON body. */
	body?: unknown;
	/** Sent as a multipart form body. */
	form?: FormData | Record<string, string | Blob>;
	headers?: Record<string, string>;
	/** Raw body, for webhooks. */
	rawBody?: string;
	cookies?: Record<string, string>;
	/** `event.route.id`, for loads that branch on the route. */
	routeId?: string | null;
	/** What `await event.parent()` returns in a page load. */
	parent?: Record<string, unknown>;
};

export type CallResult = {
	status: number;
	/** Parsed JSON body of a returned Response, if there was one. */
	json?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
	/** Message of a thrown SvelteKit `error()`. */
	error?: string;
	/** Target of a thrown SvelteKit `redirect()`. */
	redirect?: string;
	/** Whatever the function returned when it is not a Response (page loads and form actions). */
	data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
	cookies: ReturnType<typeof makeCookies>;
};

function buildRequest(o: CallOptions) {
	const method = o.method ?? 'POST';
	const url = o.url ?? 'http://localhost/';
	if (o.rawBody !== undefined)
		return new Request(url, { method, headers: o.headers, body: o.rawBody });
	if (o.form) {
		const fd = o.form instanceof FormData ? o.form : new FormData();
		if (!(o.form instanceof FormData)) {
			for (const [k, v] of Object.entries(o.form)) fd.append(k, v);
		}
		return new Request(url, { method, headers: o.headers, body: fd });
	}
	if (o.body !== undefined) {
		return new Request(url, {
			method,
			headers: { 'content-type': 'application/json', ...o.headers },
			body: JSON.stringify(o.body)
		});
	}
	return new Request(url, { method: method === 'POST' ? 'GET' : method, headers: o.headers });
}

/**
 * Call a SvelteKit endpoint, page load or form action directly, the way the server would,
 * and normalize the outcome: a returned Response, a returned value, a thrown error() or a
 * thrown redirect().
 */
export async function call(
	handler: (event: any) => unknown, // eslint-disable-line @typescript-eslint/no-explicit-any
	options: CallOptions = {}
): Promise<CallResult> {
	const cookies = makeCookies(options.cookies);
	const request = buildRequest(options);
	const event = {
		request,
		url: new URL(request.url),
		params: options.params ?? {},
		locals: { userID: options.userID === undefined ? null : options.userID },
		cookies,
		parent: async () => options.parent ?? {},
		fetch: () => {
			throw new Error('event.fetch is not available in handler tests');
		},
		setHeaders: () => undefined,
		getClientAddress: () => '127.0.0.1',
		isDataRequest: false,
		route: { id: options.routeId ?? null },
		platform: undefined
	};

	try {
		const result = await handler(event);
		if (result instanceof Response) {
			const text = await result.clone().text();
			let json: unknown;
			try {
				json = text ? JSON.parse(text) : undefined;
			} catch {
				json = undefined;
			}
			return { status: result.status, json, cookies };
		}
		// fail() returns an ActionFailure (status plus data); anything else is the load or action data.
		if (result && (result as object).constructor?.name === 'ActionFailure') {
			const failure = result as { status: number; data: unknown };
			return { status: failure.status, data: failure.data, cookies };
		}
		return { status: 200, data: result, cookies };
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, error: e.body.message, cookies };
		if (isRedirect(e)) return { status: e.status, redirect: e.location, cookies };
		throw e;
	}
}
