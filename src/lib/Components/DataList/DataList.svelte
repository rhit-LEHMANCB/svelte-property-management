<script lang="ts" module>
	import type { SortValue } from './listQuery';

	export type DataColumn<T> = {
		id: string;
		label: string;
		/** Makes the column sortable by this value. */
		sort?: (row: T) => SortValue;
		/** Hides the header text visually (for an actions column). */
		srOnly?: boolean;
		class?: string;
	};
</script>

<script lang="ts" generics="T">
	import { Pagination } from '@skeletonlabs/skeleton-svelte';
	import {
		IconArrowDown,
		IconArrowUp,
		IconChevronLeft,
		IconChevronRight,
		IconSearch,
		IconX
	} from '@tabler/icons-svelte';
	import type { Snippet } from 'svelte';
	import {
		clampPage,
		filterRows,
		pageCount,
		pageRows,
		sortRows,
		type SortDirection
	} from './listQuery';
	import { refreshing } from '$lib/Hooks/refresh';

	type Props = {
		/** Names the list for search, sort and pagination labels, for example "users". */
		label: string;
		items: T[];
		key: (row: T) => string;
		columns: DataColumn<T>[];
		/** The text a search matches against. */
		searchText: (row: T) => string;
		sortBy?: string;
		sortDirection?: SortDirection;
		pageSizes?: number[];
		pageSize?: number;
		/** One table cell's content. */
		cell: Snippet<[T, DataColumn<T>]>;
		/** Shown when the list has no rows at all. */
		empty: Snippet;
		/** Shown above the list, next to the search field (for example an Add button). */
		toolbar?: Snippet;
	};

	let {
		label,
		items,
		key,
		columns,
		searchText,
		sortBy = undefined,
		sortDirection = 'asc',
		pageSizes = [1, 2, 5, 10],
		pageSize = 5,
		cell,
		empty,
		toolbar
	}: Props = $props();

	const uid = $props.id();

	let query = $state('');
	// svelte-ignore state_referenced_locally
	let sortColumn = $state(sortBy);
	// svelte-ignore state_referenced_locally
	let direction = $state<SortDirection>(sortDirection);
	// svelte-ignore state_referenced_locally
	let size = $state(pageSize);
	let page = $state(0);

	const sortable = $derived(columns.filter((column) => column.sort));
	const filtered = $derived(filterRows(items, query, searchText));
	const sorted = $derived.by(() => {
		const column = columns.find((c) => c.id === sortColumn && c.sort);
		return column?.sort ? sortRows(filtered, column.sort, direction) : filtered;
	});
	const lastPage = $derived(pageCount(sorted.length, size));
	// Rows can disappear after an action refreshes the data; stay on the nearest page that exists.
	const current = $derived(clampPage(page, sorted.length, size));
	const visible = $derived(pageRows(sorted, current, size));

	function search(value: string) {
		query = value;
		page = 0;
	}

	function sortOn(id: string) {
		if (sortColumn === id) direction = direction === 'asc' ? 'desc' : 'asc';
		else {
			sortColumn = id;
			direction = 'asc';
		}
	}

	const ariaSort = (id: string) =>
		sortColumn === id ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-end gap-3">
		{@render toolbar?.()}
		{#if items.length > 0}
			<div class="w-full sm:ml-auto sm:w-72">
				<label class="sr-only" for="{uid}-search">Search {label}</label>
				<div class="input-group grid-cols-[auto_1fr_auto]">
					<div class="ig-cell preset-tonal"><IconSearch size={18} aria-hidden="true" /></div>
					<input
						id="{uid}-search"
						class="ig-input"
						type="search"
						placeholder="Search {label}"
						value={query}
						oninput={(event) => search(event.currentTarget.value)}
					/>
					{#if query}
						<button
							type="button"
							class="ig-btn preset-tonal"
							aria-label="Clear search"
							onclick={() => search('')}><IconX size={18} /></button
						>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	{#if items.length === 0}
		{@render empty()}
	{:else if sorted.length === 0}
		<div
			class="card bg-surface-100-900 flex flex-col items-center gap-3 p-8 text-center"
			role="status"
		>
			<p>No results for “{query}”.</p>
			<button type="button" class="btn preset-tonal" onclick={() => search('')}
				>Show all {label}</button
			>
		</div>
	{:else}
		{#if sortable.length > 0}
			<!-- Cards have no headers to click, so phones sort with a select. -->
			<div class="flex items-center gap-2 md:hidden">
				<div class="flex-auto">
					<label class="sr-only" for="{uid}-sort">Sort {label} by</label>
					<select
						id="{uid}-sort"
						class="select"
						value={sortColumn ?? ''}
						onchange={(event) => {
							sortColumn = event.currentTarget.value || undefined;
							direction = 'asc';
						}}
					>
						<option value="">Sort: default order</option>
						{#each sortable as column (column.id)}
							<option value={column.id}>Sort by {column.label.toLowerCase()}</option>
						{/each}
					</select>
				</div>
				<button
					type="button"
					class="btn-icon preset-tonal"
					disabled={!sortColumn}
					aria-label={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
					onclick={() => (direction = direction === 'asc' ? 'desc' : 'asc')}
				>
					{#if direction === 'asc'}<IconArrowUp size={18} />{:else}<IconArrowDown size={18} />{/if}
				</button>
			</div>
		{/if}

		<!--
			One table for every width: below md the header is visually hidden and each row is styled as a
			card with labeled cells, so every control exists once in the DOM.
		-->
		<div class="md:table-wrap">
			<table class="table max-md:block" aria-busy={$refreshing}>
				<caption class="sr-only">{label}</caption>
				<thead class="max-md:sr-only">
					<tr>
						{#each columns as column (column.id)}
							<th
								scope="col"
								class={column.class}
								aria-sort={column.sort ? ariaSort(column.id) : undefined}
							>
								{#if column.sort}
									<button
										type="button"
										class="inline-flex items-center gap-1 font-bold"
										onclick={() => sortOn(column.id)}
									>
										{column.label}
										{#if sortColumn === column.id}
											{#if direction === 'asc'}<IconArrowUp
													size={16}
													aria-hidden="true"
												/>{:else}<IconArrowDown size={16} aria-hidden="true" />{/if}
										{/if}
									</button>
								{:else}
									<span class:sr-only={column.srOnly}>{column.label}</span>
								{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="max-md:flex max-md:flex-col max-md:gap-3">
					{#each visible as row (key(row))}
						<tr
							class="max-md:card max-md:bg-surface-100-900 max-md:border-surface-200-800 max-md:flex max-md:flex-col max-md:gap-2 max-md:border max-md:p-4"
						>
							{#if $refreshing}
								<td colspan={columns.length} class="max-md:block max-md:p-0">
									<div class="placeholder h-6 w-full animate-pulse"></div>
								</td>
							{:else}
								{#each columns as column, index (column.id)}
									<!-- Below md each cell shows its column label (CSS content, so not part of its text). -->
									<td
										data-label={index > 0 && !column.srOnly ? column.label : undefined}
										class="{column.class ??
											''} max-md:flex max-md:items-center max-md:gap-3 max-md:p-0 max-md:data-label:before:w-24 max-md:data-label:before:shrink-0 max-md:data-label:before:text-sm max-md:data-label:before:opacity-70 max-md:data-label:before:content-[attr(data-label)]"
									>
										<div class="min-w-0 max-md:flex-auto max-md:break-words">
											{@render cell(row, column)}
										</div>
									</td>
								{/each}
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<nav class="flex flex-wrap items-center justify-between gap-3" aria-label="Pages of {label}">
			<div>
				<label class="sr-only" for="{uid}-size">Items per page</label>
				<select
					id="{uid}-size"
					class="select w-auto"
					value={size}
					onchange={(event) => {
						size = Number(event.currentTarget.value);
						page = 0;
					}}
				>
					{#each pageSizes as amount (amount)}
						<option value={amount}>Show {amount}</option>
					{/each}
				</select>
			</div>
			<span class="text-sm whitespace-nowrap" aria-live="polite"
				>Page {current + 1} of {lastPage}</span
			>
			<Pagination
				count={sorted.length}
				pageSize={size}
				page={current + 1}
				onPageChange={(details) => (page = details.page - 1)}
				class="flex gap-2"
			>
				<Pagination.PrevTrigger class="btn btn-sm preset-tonal" aria-label="Previous page">
					<IconChevronLeft size={16} aria-hidden="true" /> Previous
				</Pagination.PrevTrigger>
				<Pagination.NextTrigger class="btn btn-sm preset-tonal" aria-label="Next page">
					Next <IconChevronRight size={16} aria-hidden="true" />
				</Pagination.NextTrigger>
			</Pagination>
		</nav>
	{/if}
</div>
