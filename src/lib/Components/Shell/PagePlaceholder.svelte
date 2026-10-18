<!-- Shown while the next page loads: a heading bar and a few rows in the shape of a list page. -->
<div class="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6" role="status" aria-label="Loading">
	<div class="placeholder h-8 w-48 animate-pulse"></div>
	<div class="card bg-surface-100-900 space-y-3 p-4 sm:p-6">
		{#each Array.from({ length: 5 }, (_, i) => i) as row (row)}
			<div class="placeholder h-10 w-full animate-pulse"></div>
		{/each}
	</div>
</div>
