/** Helpers for MonthPicker: values are `YYYY-MM` month keys, as stored for a tenant's move-in month. */

export const MONTH_OPTIONS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
].map((name, index) => ({ name, value: String(index + 1).padStart(2, '0') }));

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Splits a `YYYY-MM` key into its parts; anything else gives empty parts. */
export function splitMonthKey(key: string | undefined): { year: string; month: string } {
	const match = MONTH_KEY.exec(key ?? '');
	return match ? { year: match[1], month: match[2] } : { year: '', month: '' };
}

/** The `YYYY-MM` key of the month a date falls in, in the browser's time zone. */
export function monthKeyOf(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Years to offer, newest first: ten years back through next year, widened to include a stored
 * year outside that range, and kept within 2000-2099 (the years the server accepts).
 */
export function yearOptions(key: string | undefined, now = new Date()): string[] {
	const current = now.getFullYear();
	const stored = Number(splitMonthKey(key).year) || current;
	const first = Math.max(2000, Math.min(current - 10, stored));
	const last = Math.min(2099, Math.max(current + 1, stored));
	const years: string[] = [];
	for (let year = last; year >= first; year--) years.push(String(year));
	return years;
}
