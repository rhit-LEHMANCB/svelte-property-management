import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { parseHtml } from '../../helpers/parseHtml';
import Dashboard from '../../../src/routes/(authenticated)/+page.svelte';
import AdminHome from '../../../src/routes/(authenticated)/admin/+page.svelte';

// home-dashboards: what the tenant dashboard and admin home render for given data.

const lease = {
	id: 'l1',
	address: '1 Main St, Terre Haute',
	status: 'current',
	startDate: '2026-01-01',
	endDate: null,
	rent: 1000,
	hasDocument: false,
	otherTenants: [],
	deposit: null,
	lateFee: 0,
	graceDays: 5,
	billing: {
		creditCents: 0,
		deposit: { paidCents: 0, heldCents: 0, settled: false, settlement: null }
	}
};

const summary = {
	balanceCents: 100000,
	dueDate: '2026-10-01',
	autopayOn: false,
	openRequests: 2,
	hasProperty: true,
	insurance: { state: 'on-file', endDate: '2099-01-01', companyName: 'Acme Mutual' }
};

function dashboard(overrides: Record<string, unknown> = {}, summaryOverrides = {}) {
	const data = {
		user: { permissions: 'user' },
		noLease: false,
		leaseCards: [lease],
		summary: { ...summary, ...summaryOverrides },
		...overrides
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return parseHtml(render(Dashboard, { props: { data } as any }).body);
}

type Doc = ReturnType<typeof parseHtml>;
const region = (doc: Doc, name: string) => doc.querySelector(`section[aria-label="${name}"]`);
const text = (el: { textContent: string | null } | null) =>
	(el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('home-dashboards: Tenant summary tiles', () => {
	it('Scenario: Balance owed', () => {
		const balance = region(dashboard(), 'Balance')!;
		expect(text(balance)).toContain('$1,000.00');
		expect(text(balance)).toContain('Due October 1, 2026');
		expect(balance.querySelector('a')?.getAttribute('href')).toBe('/payment');
		expect(text(balance.querySelector('a'))).toBe('Make a payment');
	});

	it('Scenario: Only an ended lease, still owing', () => {
		const doc = dashboard(
			{ leaseCards: [{ ...lease, status: 'ended' }], noLease: true },
			{ balanceCents: 50000, dueDate: '2026-09-01', hasProperty: false }
		);
		expect(text(doc.querySelector('[data-notice="warning"]'))).toContain(
			'No property is assigned to your account yet.'
		);
		const balance = region(doc, 'Balance')!;
		expect(text(balance)).toContain('$500.00');
		expect(text(balance.querySelector('a'))).toBe('Make a payment');
		expect(region(doc, 'Autopay')).toBeNull();
		expect(region(doc, 'Maintenance')).toBeNull();
	});

	it('Scenario: Nothing owed', () => {
		const balance = region(dashboard({}, { balanceCents: 0, dueDate: null }), 'Balance')!;
		expect(text(balance)).toContain('$0.00');
		expect(text(balance)).toContain('Nothing is due right now.');
		expect(balance.querySelector('a')).toBeNull();
	});

	it.each([
		[true, 'On', 'Manage autopay'],
		[false, 'Off', 'Set up autopay']
	])('Scenario: Autopay %s', (autopayOn, state, link) => {
		const tile = region(dashboard({}, { autopayOn }), 'Autopay')!;
		expect(text(tile)).toContain(state);
		expect(text(tile.querySelector('a'))).toBe(link);
		expect(tile.querySelector('a')?.getAttribute('href')).toBe('/payment');
	});

	it('Scenario: Open requests', () => {
		const tile = region(dashboard(), 'Maintenance')!;
		expect(text(tile)).toContain('Open maintenance requests 2');
		expect(tile.querySelector('a')?.getAttribute('href')).toBe('/maintenance');
	});
});

describe('home-dashboards: Tenant lease and insurance cards', () => {
	it.each([
		['on-file', 'On file', 'Update insurance'],
		['ending-soon', 'Ending soon', 'Update insurance'],
		['expired', 'Expired', 'Update insurance'],
		['missing', 'Missing', 'Add insurance']
	])('insurance %s shows "%s" and "%s"', (state, label, link) => {
		const insurance =
			state === 'missing'
				? { state }
				: { state, endDate: '2026-11-01', companyName: 'Acme Mutual' };
		const card = region(dashboard({}, { insurance }), 'Renters insurance')!;
		expect(text(card)).toContain(label);
		const anchor = card.querySelector('a')!;
		expect(text(anchor)).toBe(link);
		expect(anchor.getAttribute('href')).toBe('/insurance');
	});

	it('Scenario: Upcoming lease', () => {
		const doc = dashboard(
			{
				leaseCards: [
					{
						...lease,
						address: '570 Maple Ave, Apt 317, Noblesville',
						status: 'upcoming',
						startDate: '2099-10-23'
					}
				]
			},
			{ balanceCents: 50000, dueDate: '2099-10-23', hasProperty: false }
		);
		const card = region(doc, 'Your lease')!;
		expect(text(card)).toContain('upcoming');
		expect(text(card)).toContain('October 23, 2099 to month to month');
		const balance = region(doc, 'Balance')!;
		expect(text(balance)).toContain('$500.00');
		expect(text(balance.querySelector('a'))).toBe('Make a payment');
		expect(text(region(doc, 'Maintenance'))).toContain('Requests open when your lease starts.');
		expect(doc.querySelector('[data-notice]')).toBeNull();
	});

	it('Scenario: No lease', () => {
		const doc = dashboard(
			{ leaseCards: [], noLease: true },
			{ balanceCents: 0, dueDate: null, openRequests: 0, hasProperty: false }
		);
		expect(text(doc.querySelector('[data-notice="warning"]'))).toContain(
			'No property is assigned to your account yet.'
		);
		for (const name of ['Balance', 'Autopay', 'Maintenance', 'Your lease']) {
			expect(region(doc, name), name).toBeNull();
		}
	});
});

describe('home-dashboards: Admin needs-attention list', () => {
	const adminHome = (attention: Record<string, number>) =>
		parseHtml(render(AdminHome, { props: { data: { attention } } as never }).body);

	it('Scenario: Counts, with a row at 0 hidden', () => {
		const card = region(
			adminHome({ openRequests: 3, depositsToSettle: 1, failedAutopay: 0 }),
			'Needs attention'
		)!;
		const rows = [...card.querySelectorAll('li')].map((li) => text(li));
		expect(rows).toEqual(['3 open maintenance requests Review', '1 deposit to settle Review']);
		const links = [...card.querySelectorAll('a')].map((a) => a.getAttribute('href'));
		expect(links).toEqual(['/admin/maintenance', '/admin/properties']);
	});

	it('Scenario: All clear', () => {
		const card = region(
			adminHome({ openRequests: 0, depositsToSettle: 0, failedAutopay: 0 }),
			'Needs attention'
		)!;
		expect(text(card)).toContain('Nothing needs attention right now.');
		expect(card.querySelector('li')).toBeNull();
	});
});
