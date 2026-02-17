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
	email: z.string().email('Please enter a valid email'),
	phoneNumber: z.string().refine(validator.isMobilePhone, 'Please enter a valid phone number')
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

export const emailSchema = z.string().email();

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
			invalid_type_error: 'Bedrooms must be a number'
		})
		.positive('Bedrooms must be greater than 0')
		.int('Bedrroms must be an integer'),
	bathrooms: z
		.number({
			invalid_type_error: 'Bathrooms must be a number'
		})
		.positive('Bathrooms must be greater than 0'),
	squareFeet: z
		.number({
			required_error: 'Square feet is required',
			invalid_type_error: 'Square feet must be a number'
		})
		.positive('Square Feet must be greater than 0')
		.int('Square Feet must be an integer'),
	rent: z
		.number({ invalid_type_error: 'Rent must be a number' })
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
export type PropertySchema = typeof propertySchema;

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
			required_error: 'Please select a date',
			invalid_type_error: 'Please enter a date in the correct format'
		}),
		endDate: z.coerce.date({
			required_error: 'Please select a date',
			invalid_type_error: 'Please enter a date in the correct format'
		})
	})
	.refine((schema) => schema.startDate < schema.endDate, {
		message: 'End date must be after start date',
		path: ['endDate']
	});

export const leaseSchema = z
	.object({
		lease: z.instanceof(File, { message: 'Please upload a file.' }),
		rent: z
			.number({ invalid_type_error: 'Rent must be a number' })
			.positive('Rent must be greater than 0'),
		users: z.array(z.string()).min(1, "Lease must have at least one user.").refine(items => new Set(items).size === items.length, {
			message: 'User can not exist more than once!',
		}),
		startDate: z.date({
			required_error: 'Please select a date',
			invalid_type_error: 'Please enter a date in the correct format'
		}),
		endDate: z.coerce.date({
			required_error: 'Please select a date',
			invalid_type_error: 'Please enter a date in the correct format'
		})
	})
	.refine((schema) => schema.startDate < schema.endDate, {
		message: 'End date must be after start date',
		path: ['endDate']
	});
export type LeaseSchema = typeof leaseSchema;
