/** Messages that are not problems: a save that worked, or a summary of the field errors. */
const NOT_PROBLEMS = new Set(['Form submitted', 'Invalid form']);

/**
 * A superform message to show in the form's error notice: a problem that belongs to no single
 * field. Success messages, the "Invalid form" summary and the new-property id are left out.
 */
export function formProblem(message: unknown): string | undefined {
	if (typeof message !== 'string' || NOT_PROBLEMS.has(message)) return undefined;
	// PropertyForm's create action answers `id<new id>` to send the admin to the new property.
	if (/^id\S+$/.test(message)) return undefined;
	return message;
}
