import { describe, expect, it } from 'vitest';
import {
	MONTH_OPTIONS,
	monthKeyOf,
	splitMonthKey,
	yearOptions
} from '../../src/lib/Components/Forms/monthPicker';

const now = new Date(2026, 9, 12);

describe('MonthPicker helpers', () => {
	it('offers the twelve months with two-digit values', () => {
		expect(MONTH_OPTIONS).toHaveLength(12);
		expect(MONTH_OPTIONS[0]).toEqual({ name: 'January', value: '01' });
		expect(MONTH_OPTIONS[11]).toEqual({ name: 'December', value: '12' });
	});

	it('splits a month key and rejects anything else', () => {
		expect(splitMonthKey('2026-05')).toEqual({ year: '2026', month: '05' });
		expect(splitMonthKey('2026-13')).toEqual({ year: '', month: '' });
		expect(splitMonthKey('')).toEqual({ year: '', month: '' });
		expect(splitMonthKey(undefined)).toEqual({ year: '', month: '' });
	});

	it('builds the key of a date in local time', () => {
		expect(monthKeyOf(now)).toBe('2026-10');
		expect(monthKeyOf(new Date(2027, 0, 31))).toBe('2027-01');
	});

	it('offers ten years back through next year, newest first', () => {
		const years = yearOptions('', now);
		expect(years[0]).toBe('2027');
		expect(years.at(-1)).toBe('2016');
		expect(years).toHaveLength(12);
	});

	it('widens the range to a stored year outside it, within 2000-2099', () => {
		expect(yearOptions('2009-04', now).at(-1)).toBe('2009');
		expect(yearOptions('2031-04', now)[0]).toBe('2031');
		expect(yearOptions('2026-01', new Date(2004, 0, 1)).at(-1)).toBe('2000');
	});
});
