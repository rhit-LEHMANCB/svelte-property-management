import { describe, expect, it } from 'vitest';
import { parseHtml } from '../../helpers/parseHtml';
import { render } from 'svelte/server';
import Breadcrumbs from '$lib/Components/Shell/Breadcrumbs.svelte';
import PageHeader from '$lib/Components/Shell/PageHeader.svelte';
import CardHarness from '../../fixtures/components/CardHarness.svelte';
import NoticeHarness from '../../fixtures/components/NoticeHarness.svelte';

const html = parseHtml;

describe('Card', () => {
	it('renders its title as the first child, inside the padding', () => {
		const doc = html(render(CardHarness, { props: { title: 'Contact Info' } }).body);
		const card = doc.querySelector('[data-card]')!;
		expect(card.className).toContain('p-4 sm:p-6');
		expect(card.firstElementChild?.querySelector('h2')?.textContent).toBe('Contact Info');
	});

	it('has no heading without a title', () => {
		const doc = html(render(CardHarness, { props: {} }).body);
		expect(doc.querySelector('[data-card] h2')).toBeNull();
	});
});

describe('Notice', () => {
	it.each([
		['error', 'alert'],
		['warning', 'status'],
		['info', 'status']
	] as const)('a %s notice has role %s and the shared padding', (tone, role) => {
		const doc = html(render(NoticeHarness, { props: { tone } }).body);
		const notice = doc.querySelector('[data-notice]')!;
		expect(notice.getAttribute('role')).toBe(role);
		expect(notice.className).toContain('p-4');
	});

	it('an urgent warning, one that stopped a save, is an alert', () => {
		const doc = html(render(NoticeHarness, { props: { tone: 'warning', urgent: true } }).body);
		expect(doc.querySelector('[data-notice]')!.getAttribute('role')).toBe('alert');
	});
});

describe('Breadcrumbs', () => {
	const items = [
		{ label: 'Properties', href: '/admin/properties' },
		{ label: 'Maple House', href: '/admin/properties/p1/edit' },
		{ label: 'Edit lease' }
	];

	it('is a landmark named Breadcrumb with an ordered list', () => {
		const doc = html(render(Breadcrumbs, { props: { items } }).body);
		const nav = doc.querySelector('nav')!;
		expect(nav.getAttribute('aria-label')).toBe('Breadcrumb');
		expect(nav.querySelectorAll('ol > li')).toHaveLength(3);
	});

	it('marks only the last crumb as the current page, even when another has no link', () => {
		const doc = html(
			render(Breadcrumbs, { props: { items: [{ label: 'Payment' }, { label: 'Success' }] } }).body
		);
		const current = doc.querySelectorAll('[aria-current="page"]');
		expect(current).toHaveLength(1);
		expect(current[0].textContent).toBe('Success');
	});

	it('links every crumb but the last, which is the current page', () => {
		const doc = html(render(Breadcrumbs, { props: { items } }).body);
		const links = [...doc.querySelectorAll('nav a')].map((a) => [
			a.textContent,
			a.getAttribute('href')
		]);
		expect(links).toEqual([
			['Properties', '/admin/properties'],
			['Maple House', '/admin/properties/p1/edit']
		]);
		const current = doc.querySelector('[aria-current="page"]')!;
		expect(current.tagName).toBe('SPAN');
		expect(current.textContent).toBe('Edit lease');
	});
});

describe('PageHeader', () => {
	it('shows breadcrumbs above the h1 only when given', () => {
		const withTrail = html(
			render(PageHeader, {
				props: {
					title: 'Edit lease',
					breadcrumbs: [{ label: 'Properties', href: '/a' }, { label: 'Edit lease' }]
				}
			}).body
		);
		expect(withTrail.querySelector('nav[aria-label="Breadcrumb"]')).not.toBeNull();
		expect(withTrail.querySelector('h1')?.textContent).toBe('Edit lease');

		const without = html(render(PageHeader, { props: { title: 'Profile' } }).body);
		expect(without.querySelector('nav')).toBeNull();
	});
});
