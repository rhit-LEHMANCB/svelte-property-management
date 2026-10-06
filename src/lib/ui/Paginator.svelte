<script context="module" lang="ts">
	export type PaginationSettings = { page: number; limit: number; size: number; amounts: number[] };
</script>

<script lang="ts">
	/** Bound by the parent: `page` is zero based and `size` is the total number of items. */
	export let settings: PaginationSettings;

	$: lastPage = Math.max(Math.ceil(settings.size / settings.limit) - 1, 0);
	$: if (settings.page > lastPage) settings.page = lastPage;

	function setLimit(event: Event) {
		settings.limit = Number((event.target as HTMLSelectElement).value);
		settings.page = 0;
	}
</script>

<div class="flex flex-wrap items-center justify-between gap-4">
	<label class="label">
		<span class="sr-only">Items per page</span>
		<select class="select w-auto" value={settings.limit} on:change={setLimit}>
			{#each settings.amounts as amount}
				<option value={amount}>Show {amount}</option>
			{/each}
		</select>
	</label>
	<span class="text-sm whitespace-nowrap">Page {settings.page + 1} of {lastPage + 1}</span>
	<div class="btn-group preset-outlined-surface-200-800 shrink-0 whitespace-nowrap">
		<button
			type="button"
			class="btn btn-sm"
			disabled={settings.page <= 0}
			on:click={() => (settings.page -= 1)}>← Previous</button
		>
		<button
			type="button"
			class="btn btn-sm"
			disabled={settings.page >= lastPage}
			on:click={() => (settings.page += 1)}>Next →</button
		>
	</div>
</div>
