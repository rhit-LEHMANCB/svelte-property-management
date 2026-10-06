import { describe, expect, it } from 'vitest';
import {
	insuranceSchema,
	maintenanceSchema,
	passwordChangeSchema,
	profileSchema,
	propertySchema
} from '#lib/schemas';

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
	result.error?.issues.map((issue) => issue.message) ?? [];

describe('authentication: password policy', () => {
	const parse = (newPassword: string, verifyPassword = newPassword) =>
		passwordChangeSchema.safeParse({ newPassword, verifyPassword });

	it('Scenario: accepts 8 to 32 characters with upper, lower and a digit', () => {
		expect(parse('Abcdefg1').success).toBe(true);
		expect(parse('A' + 'b'.repeat(29) + '1' + 'c').success).toBe(true);
	});

	it('Scenario: accepts a special character in place of a digit', () => {
		expect(parse('Abcdefg!').success).toBe(true);
	});

	it('Scenario: rejects fewer than 8 characters', () => {
		expect(parse('Abc1').success).toBe(false);
	});

	it('Scenario: rejects more than 32 characters', () => {
		expect(parse('Aa1' + 'x'.repeat(30)).success).toBe(false);
	});

	it('Scenario: rejects a password with no uppercase letter', () => {
		expect(parse('abcdefg1').success).toBe(false);
	});

	it('Scenario: rejects a password with no lowercase letter', () => {
		expect(parse('ABCDEFG1').success).toBe(false);
	});

	it('Scenario: rejects a password with no digit or special character', () => {
		expect(parse('Abcdefgh').success).toBe(false);
	});

	it('Scenario: Mismatch reports "Passwords must match" on the verify field', () => {
		const result = passwordChangeSchema.safeParse({
			newPassword: 'Abcdefg1',
			verifyPassword: 'Abcdefg2'
		});
		expect(result.success).toBe(false);
		const issue =
			!result.success && result.error.issues.find((i) => i.message === 'Passwords must match');
		expect(issue && issue.path).toEqual(['verifyPassword']);
	});
});

describe('user-profile: edit contact information', () => {
	const valid = {
		firstName: 'Ada',
		lastName: 'Lovelace',
		email: 'ada@example.com',
		phoneNumber: '+15555550100'
	};

	it('Scenario: Valid update is accepted', () => {
		expect(profileSchema.safeParse(valid).success).toBe(true);
	});

	it('Scenario: Invalid form rejects an empty first or last name', () => {
		expect(messages(profileSchema.safeParse({ ...valid, firstName: '' }))).toContain(
			'Please provide a first name'
		);
		expect(messages(profileSchema.safeParse({ ...valid, lastName: '' }))).toContain(
			'Please provide a last name'
		);
	});

	it('Scenario: Invalid form rejects names over 250 characters', () => {
		expect(profileSchema.safeParse({ ...valid, firstName: 'a'.repeat(251) }).success).toBe(false);
		expect(profileSchema.safeParse({ ...valid, lastName: 'a'.repeat(251) }).success).toBe(false);
		expect(profileSchema.safeParse({ ...valid, firstName: 'a'.repeat(250) }).success).toBe(true);
	});

	it('Scenario: Invalid form rejects a bad email', () => {
		expect(messages(profileSchema.safeParse({ ...valid, email: 'not-an-email' }))).toContain(
			'Please enter a valid email'
		);
	});

	it('Scenario: Invalid form rejects a bad phone number', () => {
		expect(messages(profileSchema.safeParse({ ...valid, phoneNumber: '123' }))).toContain(
			'Please enter a valid phone number'
		);
	});
});

describe('property-management: create property validation', () => {
	const valid = {
		title: 'Maple Court',
		description: 'Two bedroom apartment',
		bedrooms: 2,
		bathrooms: 1.5,
		squareFeet: 900,
		rent: 1200,
		streetAddress: '1 Main St',
		apartmentInfo: '',
		city: 'Terre Haute',
		state: 'IN',
		zip: '47803'
	};
	const parse = (overrides: Record<string, unknown>) =>
		propertySchema.safeParse({ ...valid, ...overrides });

	it('Scenario: Valid property is accepted', () => {
		expect(parse({}).success).toBe(true);
		expect(parse({ zip: '47803-1234', apartmentInfo: 'Unit 4' }).success).toBe(true);
	});

	it('Scenario: title is required and capped at 500 characters', () => {
		expect(parse({ title: '' }).success).toBe(false);
		expect(parse({ title: 'a'.repeat(500) }).success).toBe(true);
		expect(parse({ title: 'a'.repeat(501) }).success).toBe(false);
	});

	it('Scenario: description is required and capped at 10000 characters', () => {
		expect(parse({ description: '' }).success).toBe(false);
		expect(parse({ description: 'a'.repeat(10000) }).success).toBe(true);
		expect(parse({ description: 'a'.repeat(10001) }).success).toBe(false);
	});

	it('Scenario: bedrooms must be a positive integer', () => {
		expect(parse({ bedrooms: 0 }).success).toBe(false);
		expect(parse({ bedrooms: 1.5 }).success).toBe(false);
		expect(parse({ bedrooms: 'two' }).success).toBe(false);
	});

	it('Scenario: bathrooms must be positive and may be fractional', () => {
		expect(parse({ bathrooms: 0 }).success).toBe(false);
		expect(parse({ bathrooms: 2.5 }).success).toBe(true);
	});

	it('Scenario: square feet and rent must be positive, square feet an integer', () => {
		expect(parse({ squareFeet: 0 }).success).toBe(false);
		expect(parse({ squareFeet: 900.5 }).success).toBe(false);
		expect(parse({ rent: 0 }).success).toBe(false);
		expect(parse({ rent: 1199.99 }).success).toBe(true);
	});

	it('Scenario: street address 1 to 50, apartment info up to 50, city 1 to 50', () => {
		expect(parse({ streetAddress: '' }).success).toBe(false);
		expect(parse({ streetAddress: 'a'.repeat(51) }).success).toBe(false);
		expect(parse({ apartmentInfo: 'a'.repeat(51) }).success).toBe(false);
		expect(parse({ city: '' }).success).toBe(false);
		expect(parse({ city: 'a'.repeat(51) }).success).toBe(false);
	});

	it('Scenario: state is exactly 2 characters', () => {
		expect(parse({ state: 'I' }).success).toBe(false);
		expect(parse({ state: 'IND' }).success).toBe(false);
	});

	it('Scenario: zip is 12345 or 12345-6789', () => {
		expect(parse({ zip: '1234' }).success).toBe(false);
		expect(parse({ zip: '123456' }).success).toBe(false);
		expect(parse({ zip: '47803-12' }).success).toBe(false);
		expect(parse({ zip: 'abcde' }).success).toBe(false);
	});
});

describe('renters-insurance: record policy validation', () => {
	const valid = {
		companyName: 'Acme Insurance',
		policyNumber: 'P-123',
		startDate: new Date('2026-01-01'),
		endDate: new Date('2027-01-01')
	};

	it('Scenario: Valid submission is accepted', () => {
		expect(insuranceSchema.safeParse(valid).success).toBe(true);
	});

	it('Scenario: End date not after start date is rejected on the end date field', () => {
		for (const endDate of [new Date('2026-01-01'), new Date('2025-12-31')]) {
			const result = insuranceSchema.safeParse({ ...valid, endDate });
			expect(result.success).toBe(false);
			const issue = !result.success && result.error.issues[0];
			expect(issue && issue.message).toBe('End date must be after start date');
			expect(issue && issue.path).toEqual(['endDate']);
		}
	});

	it('Scenario: company name and policy number are required and capped at 100', () => {
		expect(insuranceSchema.safeParse({ ...valid, companyName: '' }).success).toBe(false);
		expect(insuranceSchema.safeParse({ ...valid, policyNumber: '' }).success).toBe(false);
		expect(insuranceSchema.safeParse({ ...valid, companyName: 'a'.repeat(101) }).success).toBe(
			false
		);
		expect(insuranceSchema.safeParse({ ...valid, policyNumber: 'a'.repeat(101) }).success).toBe(
			false
		);
		expect(insuranceSchema.safeParse({ ...valid, companyName: 'a'.repeat(100) }).success).toBe(
			true
		);
	});

	it('Scenario: the end date accepts a date string, as posted by the form', () => {
		expect(insuranceSchema.safeParse({ ...valid, endDate: '2027-06-01' }).success).toBe(true);
	});
});

describe('maintenance-requests: submit request validation', () => {
	it('Scenario: Valid submission is accepted', () => {
		expect(
			maintenanceSchema.safeParse({ subject: 'Leak', description: 'Kitchen sink' }).success
		).toBe(true);
	});

	it('Scenario: subject is required and capped at 50 characters', () => {
		expect(maintenanceSchema.safeParse({ subject: '', description: 'x' }).success).toBe(false);
		expect(maintenanceSchema.safeParse({ subject: 'a'.repeat(50), description: 'x' }).success).toBe(
			true
		);
		expect(maintenanceSchema.safeParse({ subject: 'a'.repeat(51), description: 'x' }).success).toBe(
			false
		);
	});

	it('Scenario: description is required and capped at 10000 characters', () => {
		expect(maintenanceSchema.safeParse({ subject: 's', description: '' }).success).toBe(false);
		expect(
			maintenanceSchema.safeParse({ subject: 's', description: 'a'.repeat(10000) }).success
		).toBe(true);
		expect(
			maintenanceSchema.safeParse({ subject: 's', description: 'a'.repeat(10001) }).success
		).toBe(false);
	});
});
