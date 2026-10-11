import { describe, expect, it } from 'vitest';
import {
	clampPage,
	compareValues,
	filterRows,
	pageCount,
	pageRows,
	sortRows
} from '$lib/Components/DataList/listQuery';

// list-browsing: browser-side search, sort and paging behind every DataList.

type User = { first: string; last: string; joined?: Date };
const users: User[] = [
	{ first: 'Tom', last: 'Lehman' },
	{ first: 'Ann', last: 'better' },
	{ first: 'Zoe', last: 'QA Tenant' },
	{ first: 'Bo', last: 'Ávila' }
];
const text = (u: User) => `${u.first} ${u.last}`;

describe('Scenario: Sort by last name ignores capitalization', () => {
	it('sorts "better" before "Lehman"', () => {
		const sorted = sortRows(users, (u) => u.last, 'asc').map((u) => u.last);
		expect(sorted).toEqual(['Ávila', 'better', 'Lehman', 'QA Tenant']);
	});

	it('reverses for descending order', () => {
		const sorted = sortRows(users, (u) => u.last, 'desc').map((u) => u.last);
		expect(sorted).toEqual(['QA Tenant', 'Lehman', 'better', 'Ávila']);
	});

	it('keeps blank values last in both directions and leaves the input untouched', () => {
		const rows = [{ v: '' }, { v: 'b' }, { v: undefined }, { v: 'a' }];
		expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual(['a', 'b', '', undefined]);
		expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual(['b', 'a', '', undefined]);
		expect(rows.map((r) => r.v)).toEqual(['', 'b', undefined, 'a']);
	});

	it('orders dates and numbers by value, and numbers inside text naturally', () => {
		expect(compareValues(new Date('2026-01-02'), new Date('2026-01-01'))).toBeGreaterThan(0);
		expect(compareValues(2, 10)).toBeLessThan(0);
		expect(compareValues('Unit 2', 'Unit 10')).toBeLessThan(0);
	});
});

describe('Scenario: Filter rows in the browser', () => {
	it('matches part of a name without regard to case', () => {
		expect(filterRows(users, 'LEH', text).map((u) => u.first)).toEqual(['Tom']);
	});

	it('requires every word to match', () => {
		expect(filterRows(users, 'zoe tenant', text).map((u) => u.first)).toEqual(['Zoe']);
		expect(filterRows(users, 'zoe lehman', text)).toEqual([]);
	});

	it('keeps every row for an empty or blank search', () => {
		expect(filterRows(users, '   ', text)).toHaveLength(users.length);
	});
});

describe('Scenario: Paging keeps the page inside the rows that exist', () => {
	it('counts pages, with one page for an empty list', () => {
		expect(pageCount(0, 5)).toBe(1);
		expect(pageCount(5, 5)).toBe(1);
		expect(pageCount(6, 5)).toBe(2);
	});

	it('clamps a page that no longer exists after rows were removed or filtered', () => {
		expect(clampPage(3, 6, 5)).toBe(1);
		expect(clampPage(-1, 6, 5)).toBe(0);
		expect(clampPage(1, 0, 5)).toBe(0);
	});

	it('returns the rows of a page', () => {
		const rows = [1, 2, 3, 4, 5, 6, 7];
		expect(pageRows(rows, 1, 3)).toEqual([4, 5, 6]);
		expect(pageRows(rows, 9, 3)).toEqual([7]);
	});
});
