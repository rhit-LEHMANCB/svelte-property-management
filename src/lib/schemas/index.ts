import validator from 'validator';
import { z } from 'zod';

export const profileSchema = z.object({
	firstName: z
		.string()
		.min(1, 'Please provide a first name')
		.max(250, 'First name cannot exceed 250 characters'),
	lastName: z
		.string()
		.min(1, 'Please provide a last name')
		.max(250, 'Last name cannot exceed 250 characters'),
	email: z.email('Please enter a valid email'),
	phoneNumber: z.string().refine(validator.isMobilePhone, 'Please enter a valid phone number'),
	// Only needed (and checked on the server) when the email changes.
	currentPassword: z.string().max(4096).optional()
});

export const passwordChangeSchema = z
	.object({
		newPassword: z
			.string()
			.min(8, 'Password must be between 8 and 32 characters')
			.max(32, 'Password must be between 8 and 32 characters')
			.regex(
				/^(?=.*[a-z])(?=.*[A-Z])(?=.*[\d!@#$%^&*()_+{}|:<>?~\-=[\];',./\\]).{8,32}$/,
				'Password must contain one uppercase letter, one lowercase, and then either a number or special character'
			),
		verifyPassword: z.string().min(1, 'Please enter your password again')
	})
	.refine((schema) => schema.newPassword === schema.verifyPassword, {
		message: 'Passwords must match',
		path: ['verifyPassword']
	});

export const emailSchema = z.email();

export const maintenanceSchema = z.object({
	subject: z
		.string()
		.min(1, 'Please provide a subject')
		.max(50, 'Subject cannot exceed 50 characters'),
	description: z
		.string()
		.min(1, 'Please provide a description')
		.max(10000, 'Description cannot exceed 10000 characters')
});

export const propertySchema = z.object({
	title: z.string().min(1, 'Please provide a title').max(500, 'Title cannot exceed 500 characters'),
	description: z
		.string()
		.min(1, 'Please provide a description')
		.max(10000, 'Description cannot exceed 10000 characters'),
	bedrooms: z
		.number({
			error: (issue) => (issue.input === undefined ? 'Required' : 'Bedrooms must be a number')
		})
		.positive('Bedrooms must be greater than 0')
		.int('Bedrroms must be an integer'),
	bathrooms: z
		.number({
			error: (issue) => (issue.input === undefined ? 'Required' : 'Bathrooms must be a number')
		})
		.positive('Bathrooms must be greater than 0'),
	squareFeet: z
		.number({
			error: (issue) =>
				issue.input === undefined ? 'Square feet is required' : 'Square feet must be a number'
		})
		.positive('Square Feet must be greater than 0')
		.int('Square Feet must be an integer'),
	rent: z
		.number({
			error: (issue) => (issue.input === undefined ? 'Required' : 'Rent must be a number')
		})
		.positive('Rent must be greater than 0'),
	streetAddress: z
		.string()
		.min(1, 'Please provide a street address')
		.max(50, 'Street address cannot exceed 50 characters'),
	apartmentInfo: z.string().max(50, 'Apartment info cannot exceed 50 characters'),
	city: z.string().min(1, 'Please provide a city').max(50, 'City cannot exceed 50 characters'),
	state: z
		.string()
		.min(2, 'Please enter a valid state code')
		.max(2, 'Please enter a valid state code'),
	zip: z.string().regex(/^[0-9]{5}(?:-[0-9]{4})?$/, 'Please enter a valid zip code')
});
export type PropertySchema = z.infer<typeof propertySchema>;

export const insuranceSchema = z
	.object({
		companyName: z
			.string()
			.min(1, 'Please provide the name of your insurance company')
			.max(100, 'Company Name cannot exceed 100 characters'),
		policyNumber: z
			.string()
			.min(1, 'Please provide your policy number')
			.max(100, 'Company Name cannot exceed 100 characters'),
		startDate: z.date({
			error: (issue) =>
				issue.input === undefined
					? 'Please select a date'
					: 'Please enter a date in the correct format'
		}),
		endDate: z.coerce.date({
			error: (issue) =>
				issue.input === undefined
					? 'Please select a date'
					: 'Please enter a date in the correct format'
		})
	})
	.refine((schema) => schema.startDate < schema.endDate, {
		message: 'End date must be after start date',
		path: ['endDate']
	});

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day written as `YYYY-MM-DD` (rejects 2026-02-30). */
export function isIsoDate(value: string) {
	const match = ISO_DATE.exec(value);
	if (!match) return false;
	const [y, m, d] = match.slice(1).map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const NO_TENANTS_MESSAGE = 'A lease needs at least one tenant.';

// Billing only understands years 2000-2099, so a typo such as 1026 is refused here instead of being
// silently billed as if the lease had no start or end.
const inBillingYears = (date: string) => /^20\d{2}-/.test(date);
const YEAR_MESSAGE = 'Please enter a year from 2000 to 2099';

export const leaseSchema = z
	.object({
		rent: z
			.number({
				error: (issue) => (issue.input === undefined ? 'Required' : 'Rent must be a number')
			})
			.positive('Rent must be greater than 0')
			.refine(
				(rent) => Math.abs(rent * 100 - Math.round(rent * 100)) < 1e-6,
				'Rent can have at most two decimal places'
			),
		startDate: z
			.string()
			.min(1, 'Please select a start date')
			.refine(isIsoDate, 'Please enter a date in the correct format')
			.refine(inBillingYears, YEAR_MESSAGE),
		// Empty means month to month.
		endDate: z
			.string()
			.refine((v) => v === '' || isIsoDate(v), 'Please enter a date in the correct format')
			.refine((v) => v === '' || inBillingYears(v), YEAR_MESSAGE),
		// One row per tenant; blank rows are ignored.
		emails: z.array(z.string().max(320, 'Email is too long')).superRefine((emails, ctx) => {
			const filled = emails.map((e) => e.trim()).filter((e) => e !== '');
			if (filled.length === 0) {
				ctx.addIssue({ code: 'custom', message: NO_TENANTS_MESSAGE });
				return;
			}
			emails.forEach((email, index) => {
				const trimmed = email.trim();
				if (trimmed !== '' && !emailSchema.safeParse(trimmed).success) {
					ctx.addIssue({
						code: 'custom',
						message: `"${trimmed}" is not a valid email address`,
						path: [index]
					});
				}
			});
		}),
		// Set when the admin chose "Save anyway" after an overlap warning.
		confirmOverlap: z.boolean().default(false)
	})
	.refine((lease) => lease.endDate === '' || lease.endDate > lease.startDate, {
		message: 'End date must be after start date',
		path: ['endDate']
	});
export type LeaseInput = z.infer<typeof leaseSchema>;

/** Trimmed, lowercased, de-duplicated tenant emails, in the order given. */
export function normalizeEmails(emails: string[]) {
	return [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e !== ''))];
}
