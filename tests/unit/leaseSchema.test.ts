import { describe, expect, it } from 'vitest';
import { isIsoDate, leaseSchema, NO_TENANTS_MESSAGE, normalizeEmails } from '$lib/schemas';

// leases: Lease record and Add tenants by email, the input checks.
const valid = {
	rent: 1250,
	startDate: '2026-11-01',
	endDate: '',
	emails: ['tenant@example.com'],
	lateFee: 62.5,
	graceDays: 5,
	confirmOverlap: false
};
const issues = (input: object) => {
	const result = leaseSchema.safeParse({ ...valid, ...input });
	return result.success
		? []
		: result.error.issues.map((i) => ({ path: i.path, message: i.message }));
};

describe('leases: Lease record', () => {
	it('Scenario: Valid lease (month to month)', () => {
		expect(issues({})).toEqual([]);
		expect(issues({ endDate: '2027-10-31' })).toEqual([]);
	});

	it('Scenario: Invalid fields: rent not above 0 or with more than two decimals', () => {
		expect(issues({ rent: 0 })[0].message).toBe('Rent must be greater than 0');
		expect(issues({ rent: -5 })[0].message).toBe('Rent must be greater than 0');
		expect(issues({ rent: 1250.555 })[0].message).toBe('Rent can have at most two decimal places');
		expect(issues({ rent: 1250.55 })).toEqual([]);
	});

	it('Scenario: Invalid fields: missing or malformed start date', () => {
		expect(issues({ startDate: '' })[0]).toEqual({
			path: ['startDate'],
			message: 'Please select a start date'
		});
		expect(issues({ startDate: '2026-02-30' })[0].message).toBe(
			'Please enter a date in the correct format'
		);
	});

	it('Invalid fields: a year outside 2000-2099 is refused, so billing never ignores a date', () => {
		expect(issues({ startDate: '1026-11-01' })).toEqual([
			{ path: ['startDate'], message: 'Please enter a year from 2000 to 2099' }
		]);
		expect(issues({ endDate: '2126-11-01' })[0]).toEqual({
			path: ['endDate'],
			message: 'Please enter a year from 2000 to 2099'
		});
	});

	it('Scenario: Invalid fields: end date not after the start date', () => {
		expect(issues({ endDate: '2026-11-01' })).toEqual([
			{ path: ['endDate'], message: 'End date must be after start date' }
		]);
		expect(issues({ endDate: '2026-10-31' })[0].path).toEqual(['endDate']);
	});

	it('Scenario: No tenants', () => {
		expect(issues({ emails: [] })).toEqual([{ path: ['emails'], message: NO_TENANTS_MESSAGE }]);
		expect(issues({ emails: ['', '  '] })).toEqual([
			{ path: ['emails'], message: NO_TENANTS_MESSAGE }
		]);
	});
});

describe('leases: Add tenants by email', () => {
	it('Scenario: Malformed email names the entry', () => {
		expect(issues({ emails: ['ok@example.com', ' not-an-email '] })).toEqual([
			{ path: ['emails', 1], message: '"not-an-email" is not a valid email address' }
		]);
	});

	it('Scenario: Same email twice, in any case, is added once', () => {
		expect(normalizeEmails([' Ada@Example.com', 'ada@example.com', '', 'bo@example.com '])).toEqual(
			['ada@example.com', 'bo@example.com']
		);
	});
});

describe('isIsoDate', () => {
	it('accepts real days only', () => {
		expect(isIsoDate('2028-02-29')).toBe(true);
		expect(isIsoDate('2027-02-29')).toBe(false);
		expect(isIsoDate('2026-13-01')).toBe(false);
		expect(isIsoDate('2026-1-01')).toBe(false);
	});
});

describe('lease-billing and security-deposits: lease terms', () => {
	it('Scenario: Valid terms (deposit optional, due date optional)', () => {
		expect(
			issues({ deposit: 1000, depositDueDate: '2026-10-20', lateFee: 75, graceDays: 5 })
		).toEqual([]);
		expect(issues({ deposit: undefined, depositDueDate: '', lateFee: 0, graceDays: 0 })).toEqual(
			[]
		);
		expect(issues({ graceDays: 31 })).toEqual([]);
	});

	it('Scenario: Invalid deposit: 0 or less, or more than two decimals', () => {
		expect(issues({ deposit: 0 })).toEqual([
			{ path: ['deposit'], message: 'Deposit must be greater than 0' }
		]);
		expect(issues({ deposit: -5 })).toEqual([
			{ path: ['deposit'], message: 'Deposit must be greater than 0' }
		]);
		expect(issues({ deposit: 10.005 })).toEqual([
			{ path: ['deposit'], message: 'Deposit can have at most two decimal places' }
		]);
		expect(issues({ depositDueDate: '2026-02-30' })[0].path).toEqual(['depositDueDate']);
	});

	it('Scenario: Invalid terms: negative or fractional-cent late fee, grace days not a whole number from 0 to 31', () => {
		expect(issues({ lateFee: -1 })).toEqual([
			{ path: ['lateFee'], message: 'Late fee cannot be negative' }
		]);
		expect(issues({ lateFee: 1.234 })).toEqual([
			{ path: ['lateFee'], message: 'Late fee can have at most two decimal places' }
		]);
		expect(issues({ graceDays: 32 })).toEqual([
			{ path: ['graceDays'], message: 'Grace days must be from 0 to 31' }
		]);
		expect(issues({ graceDays: -1 })).toEqual([
			{ path: ['graceDays'], message: 'Grace days must be from 0 to 31' }
		]);
		expect(issues({ graceDays: 2.5 })).toEqual([
			{ path: ['graceDays'], message: 'Grace days must be a whole number' }
		]);
	});
});
