// Lease shapes shared by the server and the lease pages.

export type EmailProblem = { email: string; message: string };

export type OverlapSummary = {
	id: string;
	startDate: string;
	endDate: string | null;
	tenantNames: string[];
};

/** What the lease form shows after a save that did not simply succeed. */
export type LeaseFormMessage =
	| { type: 'conflicts'; problems: EmailProblem[] }
	| { type: 'overlap'; overlapping: OverlapSummary[] }
	| { type: 'document'; text: string }
	| { type: 'error'; text: string }
	| { type: 'emailFailures'; emails: string[]; leaseId: string };

export type LeaseStatus = 'upcoming' | 'current' | 'ended';

export type TenantSummary = { id: string; name: string; email: string };

export type LeaseSummary = {
	id: string;
	propertyId: string;
	rent: number;
	startDate: string;
	endDate: string | null;
	status: LeaseStatus;
	tenants: TenantSummary[];
	hasDocument: boolean;
};
