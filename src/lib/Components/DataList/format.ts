/** A short date and time for list cells, for example "10/6/26, 8:23 AM"; blank when unknown. */
export function formatDateTime(date: Date | null | undefined): string {
	return date ? date.toLocaleString('en-us', { dateStyle: 'short', timeStyle: 'short' }) : '';
}
