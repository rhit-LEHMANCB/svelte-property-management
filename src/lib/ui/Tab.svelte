<script lang="ts">
	export let group: unknown;
	export let name: string;
	export let value: unknown;
</script>

<label
	class="flex-1 cursor-pointer border-b-2 px-4 py-2 text-center {group === value
		? 'border-primary-500 font-bold'
		: 'border-transparent opacity-70 hover:opacity-100'}"
>
	<input type="radio" class="sr-only" bind:group {name} {value} />
	<slot />
</label>
