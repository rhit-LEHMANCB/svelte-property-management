// Browser-side search, sort and paging for DataList. Kept free of Svelte so it can be unit tested.

export type SortDirection = 'asc' | 'desc';
export type SortValue = string | number | Date | null | undefined;

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Orders values ascending: text without regard to case or accents, then numbers and dates; blanks last. */
export function compareValues(a: SortValue, b: SortValue): number {
	const blankA = a === null || a === undefined || a === '';
	const blankB = b === null || b === undefined || b === '';
	if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;
	if (a instanceof Date || b instanceof Date) {
		return new Date(a as Date).getTime() - new Date(b as Date).getTime();
	}
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	return collator.compare(String(a), String(b));
}

/** Rows whose text contains every word of the query, ignoring case. An empty query keeps all rows. */
export function filterRows<T>(rows: readonly T[], query: string, text: (row: T) => string): T[] {
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [...rows];
	return rows.filter((row) => {
		const haystack = text(row).toLowerCase();
		return words.every((word) => haystack.includes(word));
	});
}

/** A sorted copy; rows with equal values keep their original order. Blanks stay last either way. */
export function sortRows<T>(
	rows: readonly T[],
	value: (row: T) => SortValue,
	direction: SortDirection
): T[] {
	const sign = direction === 'asc' ? 1 : -1;
	return rows
		.map((row, index) => ({ row, index, key: value(row) }))
		.sort((x, y) => {
			const blankX = x.key === null || x.key === undefined || x.key === '';
			const blankY = y.key === null || y.key === undefined || y.key === '';
			if (blankX !== blankY) return blankX ? 1 : -1;
			return sign * compareValues(x.key, y.key) || x.index - y.index;
		})
		.map(({ row }) => row);
}

/** Number of pages for `total` rows; an empty list still has one (empty) page. */
export function pageCount(total: number, pageSize: number): number {
	return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** Keeps a zero-based page index inside the pages that exist, for example after rows were removed. */
export function clampPage(page: number, total: number, pageSize: number): number {
	return Math.min(Math.max(0, page), pageCount(total, pageSize) - 1);
}

/** The rows on a zero-based page. */
export function pageRows<T>(rows: readonly T[], page: number, pageSize: number): T[] {
	const start = clampPage(page, rows.length, pageSize) * pageSize;
	return rows.slice(start, start + pageSize);
}
