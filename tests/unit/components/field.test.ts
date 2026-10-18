import { describe, expect, it } from 'vitest';
import { parseHtml } from '../../helpers/parseHtml';
import { render } from 'svelte/server';
import { get, writable } from 'svelte/store';
import { errorsAfterSubmit } from '$lib/forms/errorsAfterSubmit';
import { promptProblem } from '$lib/ui/stores';
import FieldHarness from '../../fixtures/components/FieldHarness.svelte';

const html = parseHtml;

describe('Field', () => {
	it('labels the control and shows no error without errors', () => {
		const doc = html(render(FieldHarness, { props: {} }).body);
		const input = doc.querySelector('input')!;
		expect(doc.querySelector('label')?.getAttribute('for')).toBe('first');
		expect(input.id).toBe('first');
		expect(input.hasAttribute('aria-invalid')).toBe(false);
		expect(input.hasAttribute('aria-describedby')).toBe(false);
		expect(input.classList.contains('input-error')).toBe(false);
		expect(doc.querySelector('[data-field-error]')).toBeNull();
	});

	it('marks the control invalid and links the first error under it', () => {
		const doc = html(
			render(FieldHarness, { props: { errors: ['Please provide a first name', 'second'] } }).body
		);
		const input = doc.querySelector('input')!;
		const error = doc.querySelector('[data-field-error]')!;
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(input.getAttribute('aria-describedby')).toBe(error.id);
		expect(input.classList.contains('input-error')).toBe(true);
		expect(error.textContent).toBe('Please provide a first name');
		// The message follows the control, outside the label so it is not part of the field's name.
		expect(doc.querySelector('label')?.contains(error)).toBe(false);
	});
});

describe('errorsAfterSubmit', () => {
	it('hides errors until the form is submitted, then follows them', () => {
		const errors = writable<{ firstName?: string[] }>({ firstName: ['Required'] });
		const gate = errorsAfterSubmit();
		const shown = gate.shown(errors);
		expect(get(shown)).toEqual({});
		gate.markSubmitted();
		expect(get(shown)).toEqual({ firstName: ['Required'] });
		errors.set({});
		expect(get(shown)).toEqual({});
		gate.reset();
		errors.set({ firstName: ['Required'] });
		expect(get(shown)).toEqual({});
	});

	it('shows errors at once for a form the server already answered', () => {
		const shown = errorsAfterSubmit(true).shown(writable({ email: ['Bad'] }));
		expect(get(shown)).toEqual({ email: ['Bad'] });
	});
});

describe('promptProblem', () => {
	const validate = (value: string) =>
		value.includes('@') ? undefined : 'Please enter a valid email.';

	it('returns the validate message for a prompt', () => {
		expect(promptProblem({ type: 'prompt', validate }, 'nope')).toBe('Please enter a valid email.');
		expect(promptProblem({ type: 'prompt', validate }, 'a@b.co')).toBeUndefined();
	});

	it('lets prompts without validate and other modal types through', () => {
		expect(promptProblem({ type: 'prompt' }, '')).toBeUndefined();
		expect(promptProblem({ type: 'confirm', validate }, '')).toBeUndefined();
	});
});
