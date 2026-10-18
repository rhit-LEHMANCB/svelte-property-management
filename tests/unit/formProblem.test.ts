import { describe, expect, it } from 'vitest';
import { formProblem } from '$lib/forms/formProblem';

describe('formProblem', () => {
	it('passes through a message that belongs to no field', () => {
		expect(formProblem('Your changes could not be saved. Please try again.')).toBe(
			'Your changes could not be saved. Please try again.'
		);
	});

	it.each([undefined, 'Form submitted', 'Invalid form', 'idAbc123'])('leaves out %j', (message) => {
		expect(formProblem(message)).toBeUndefined();
	});
});
