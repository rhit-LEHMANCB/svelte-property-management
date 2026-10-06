import { isDeepStrictEqual } from 'node:util';

/**
 * A small in-memory stand-in for the Firestore Admin SDK, covering only the calls the app makes:
 * collection/doc/collection(sub), get/set(merge)/update/add/delete, where(==, !=, in, not-in,
 * documentId), orderBy, limit, and the FieldValue sentinels serverTimestamp, increment,
 * arrayUnion, arrayRemove, delete. It exists so handler tests run without Java or an emulator;
 * the Playwright layer covers real Firestore behavior.
 *
 * Not modeled: composite-index requirements, the 10-value limit on `in` and `not-in`, transactions,
 * atomicity of batches (they are applied in order), security rules, and consistency or latency.
 */

export class FakeTimestamp {
	constructor(
		public seconds: number,
		public nanoseconds = 0
	) {}
	static fromMillis(ms: number) {
		return new FakeTimestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
	}
	static fromDate(date: Date) {
		return FakeTimestamp.fromMillis(date.getTime());
	}
	static now() {
		return FakeTimestamp.fromMillis(Date.now());
	}
	toMillis() {
		return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
	}
	toDate() {
		return new Date(this.toMillis());
	}
}

type Sentinel = 'serverTimestamp' | 'increment' | 'arrayUnion' | 'arrayRemove' | 'delete';

export class FakeFieldValue {
	constructor(
		public kind: Sentinel,
		public arg?: unknown
	) {}
	static serverTimestamp() {
		return new FakeFieldValue('serverTimestamp');
	}
	static increment(n: number) {
		return new FakeFieldValue('increment', n);
	}
	static arrayUnion(...elements: unknown[]) {
		return new FakeFieldValue('arrayUnion', elements);
	}
	static arrayRemove(...elements: unknown[]) {
		return new FakeFieldValue('arrayRemove', elements);
	}
	static delete() {
		return new FakeFieldValue('delete');
	}
}

export class FakeFieldPath {
	constructor(public path: string) {}
	static documentId() {
		return new FakeFieldPath('__name__');
	}
}

export class FirestoreNotFoundError extends Error {
	code = 5;
	constructor(path: string) {
		super(`5 NOT_FOUND: No document to update: ${path}`);
	}
}

type Data = Record<string, unknown>;

/** The real SDK rejects `undefined` field values unless ignoreUndefinedProperties is set (it is not). */
function assertNoUndefined(value: unknown, path = 'document'): void {
	if (value === undefined) {
		throw new Error(`Cannot use "undefined" as a Firestore value (found at ${path}).`);
	}
	if (Array.isArray(value)) value.forEach((v, i) => assertNoUndefined(v, `${path}[${i}]`));
	else if (typeof value === 'object' && value !== null && value.constructor === Object) {
		for (const [k, v] of Object.entries(value)) assertNoUndefined(v, `${path}.${k}`);
	}
}

const isPlainObject = (v: unknown): v is Data =>
	typeof v === 'object' &&
	v !== null &&
	!Array.isArray(v) &&
	!(v instanceof FakeTimestamp) &&
	!(v instanceof FakeFieldValue) &&
	!(v instanceof Date);

function clone<T>(value: T): T {
	if (value instanceof FakeTimestamp)
		return new FakeTimestamp(value.seconds, value.nanoseconds) as T;
	if (value instanceof Date) return new Date(value.getTime()) as T;
	if (Array.isArray(value)) return value.map(clone) as T;
	if (isPlainObject(value)) {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
	}
	return value;
}

/** Resolve a value (possibly a sentinel) against what is currently stored at that field. */
function resolve(value: unknown, existing: unknown, merge: boolean): unknown {
	if (value instanceof FakeFieldValue) {
		switch (value.kind) {
			case 'serverTimestamp':
				return FakeTimestamp.now();
			case 'increment':
				return (typeof existing === 'number' ? existing : 0) + (value.arg as number);
			case 'arrayUnion': {
				const base = Array.isArray(existing) ? [...existing] : [];
				for (const el of value.arg as unknown[]) {
					if (!base.some((b) => isDeepStrictEqual(b, el))) base.push(clone(el));
				}
				return base;
			}
			case 'arrayRemove': {
				const base = Array.isArray(existing) ? existing : [];
				return base.filter((b) => !(value.arg as unknown[]).some((el) => isDeepStrictEqual(b, el)));
			}
			case 'delete':
				return undefined;
		}
	}
	if (isPlainObject(value)) {
		const base = merge && isPlainObject(existing) ? { ...existing } : {};
		for (const [k, v] of Object.entries(value)) {
			const resolved = resolve(v, base[k], merge);
			if (resolved === undefined) delete base[k];
			else base[k] = resolved;
		}
		return base;
	}
	return clone(value);
}

function getField(data: Data | undefined, field: string): unknown {
	return field
		.split('.')
		.reduce<unknown>((acc, key) => (isPlainObject(acc) ? acc[key] : undefined), data);
}

const comparable = (v: unknown) => (v instanceof FakeTimestamp ? v.toMillis() : v);

export class FakeSnapshot {
	constructor(
		public ref: FakeDocRef,
		private stored: Data | undefined
	) {}
	get id() {
		return this.ref.id;
	}
	get exists() {
		return this.stored !== undefined;
	}
	data() {
		return this.stored === undefined ? undefined : clone(this.stored);
	}
}

export class FakeQuerySnapshot {
	constructor(public docs: FakeSnapshot[]) {}
	get size() {
		return this.docs.length;
	}
	get empty() {
		return this.docs.length === 0;
	}
	forEach(cb: (doc: FakeSnapshot) => void) {
		this.docs.forEach(cb);
	}
}

type Filter = { field: string | FakeFieldPath; op: string; value: unknown };
type Order = { field: string; direction: 'asc' | 'desc' };

export class FakeQuery {
	constructor(
		protected db: FakeFirestore,
		public path: string,
		protected filters: Filter[] = [],
		protected orders: Order[] = [],
		protected max?: number
	) {}

	where(field: string | FakeFieldPath, op: string, value: unknown) {
		return new FakeQuery(
			this.db,
			this.path,
			[...this.filters, { field, op, value }],
			this.orders,
			this.max
		);
	}
	orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
		return new FakeQuery(
			this.db,
			this.path,
			this.filters,
			[...this.orders, { field, direction }],
			this.max
		);
	}
	limit(n: number) {
		return new FakeQuery(this.db, this.path, this.filters, this.orders, n);
	}

	private matches(id: string, data: Data, f: Filter) {
		const actual = f.field instanceof FakeFieldPath ? id : getField(data, f.field);
		const a = comparable(actual);
		switch (f.op) {
			case '==':
				return isDeepStrictEqual(a, comparable(f.value));
			case '!=':
				// Like Firestore, documents without the field are not returned.
				return a !== undefined && !isDeepStrictEqual(a, comparable(f.value));
			case 'in':
				return (f.value as unknown[]).some((v) => isDeepStrictEqual(a, comparable(v)));
			case 'not-in':
				return (
					a !== undefined &&
					!(f.value as unknown[]).some((v) => isDeepStrictEqual(a, comparable(v)))
				);
			default:
				throw new Error(`FakeFirestore: unsupported operator ${f.op}`);
		}
	}

	async get() {
		let rows = this.db.listCollection(this.path);
		for (const f of this.filters) rows = rows.filter(([id, data]) => this.matches(id, data, f));
		for (const o of [...this.orders].reverse()) {
			// Firestore leaves out documents that lack the ordered field.
			rows = rows.filter(([, data]) => getField(data, o.field) !== undefined);
			rows.sort(([, x], [, y]) => {
				const a = comparable(getField(x, o.field)) as number | string;
				const b = comparable(getField(y, o.field)) as number | string;
				const cmp = a < b ? -1 : a > b ? 1 : 0;
				return o.direction === 'asc' ? cmp : -cmp;
			});
		}
		if (this.max !== undefined) rows = rows.slice(0, this.max);
		return new FakeQuerySnapshot(
			rows.map(([id, data]) => new FakeSnapshot(this.db.doc(`${this.path}/${id}`), data))
		);
	}
}

export class FakeCollectionRef extends FakeQuery {
	doc(id?: string) {
		return this.db.doc(`${this.path}/${id ?? this.db.newId()}`);
	}
	async add(data: Data) {
		const ref = this.doc();
		await ref.set(data);
		return ref;
	}
}

export class FakeDocRef {
	constructor(
		private db: FakeFirestore,
		public path: string
	) {}
	get id() {
		return this.path.split('/').pop() as string;
	}
	collection(name: string) {
		return this.db.collection(`${this.path}/${name}`);
	}
	async get() {
		return new FakeSnapshot(this, this.db.read(this.path));
	}
	async set(data: Data, options?: { merge?: boolean }) {
		assertNoUndefined(data);
		const merge = options?.merge === true;
		const existing = merge ? this.db.read(this.path) : undefined;
		this.db.write(this.path, resolve(data, existing, merge) as Data);
	}
	async update(data: Data) {
		assertNoUndefined(data);
		const existing = this.db.read(this.path);
		if (!existing) throw new FirestoreNotFoundError(this.path);
		const next = { ...existing };
		for (const [key, value] of Object.entries(data)) {
			// Dotted keys update nested fields; plain keys replace the whole field.
			const parts = key.split('.');
			let target = next as Data;
			for (const part of parts.slice(0, -1)) {
				target[part] = isPlainObject(target[part]) ? { ...(target[part] as Data) } : {};
				target = target[part] as Data;
			}
			const last = parts[parts.length - 1];
			const resolved = resolve(value, target[last], false);
			if (resolved === undefined) delete target[last];
			else target[last] = resolved;
		}
		this.db.write(this.path, next);
	}
	async delete() {
		this.db.remove(this.path);
	}
}

export class FakeFirestore {
	private store = new Map<string, Data>();
	private counter = 0;

	reset() {
		this.store.clear();
		this.counter = 0;
	}
	newId() {
		this.counter += 1;
		return `auto-id-${this.counter}`;
	}
	collection(path: string) {
		return new FakeCollectionRef(this, path);
	}
	doc(path: string) {
		return new FakeDocRef(this, path);
	}
	/** Writes are queued and applied on commit(); the real SDK applies them atomically. */
	batch() {
		const ops: (() => Promise<void>)[] = [];
		const batch = {
			set(ref: FakeDocRef, data: Data, options?: { merge?: boolean }) {
				ops.push(() => ref.set(data, options));
				return batch;
			},
			async commit() {
				for (const op of ops) await op();
			}
		};
		return batch;
	}

	// Storage primitives used by the refs above.
	read(path: string) {
		return this.store.get(path);
	}
	write(path: string, data: Data) {
		this.store.set(path, clone(data));
	}
	remove(path: string) {
		this.store.delete(path);
	}
	listCollection(path: string): [string, Data][] {
		const prefix = `${path}/`;
		return [...this.store.entries()]
			.filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
			.map(([p, data]) => [p.slice(prefix.length), data]);
	}

	// Test conveniences.
	seed(path: string, data: Data) {
		this.write(path, resolve(data, undefined, false) as Data);
	}
	peek(path: string) {
		const stored = this.store.get(path);
		return stored === undefined ? undefined : clone(stored);
	}
}
