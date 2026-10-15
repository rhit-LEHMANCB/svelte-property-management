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

/** What a lease owes and holds, for the admin lease list. Amounts in cents. */
export type LeaseBilling = {
	totalCents: number;
	creditCents: number;
	dueDate: string | null;
	deposit: {
		amountCents: number;
		paidCents: number;
		heldCents: number;
		settled: boolean;
		toSettle: boolean;
		settlement: {
			returned: number;
			deductions: { amount: number; reason: string }[];
			recordedAt: string;
		} | null;
	};
	lateFees: {
		month: string;
		monthLabel: string;
		amountCents: number;
		paidCents: number;
		owedCents: number;
		waived: boolean;
	}[];
};

export type LeaseSummary = {
	id: string;
	propertyId: string;
	rent: number;
	startDate: string;
	endDate: string | null;
	status: LeaseStatus;
	tenants: TenantSummary[];
	hasDocument: boolean;
	billing?: LeaseBilling;
};

/** A lease as its tenant sees it on the dashboard and payment page. */
export type TenantLease = {
	id: string;
	propertyId: string;
	address: string;
	rent: number;
	startDate: string;
	endDate: string | null;
	status: LeaseStatus;
	/**
	 * Names of the other tenants on the lease, never their contact details. Loaded only for the
	 * dashboard.
	 */
	otherTenants?: string[];
	hasDocument: boolean;
	/** The security deposit in dollars and its due date, or null for none. */
	deposit: { amount: number; dueDate: string } | null;
	lateFee?: number;
	graceDays?: number;
	lateFeesFrom?: string;
};
