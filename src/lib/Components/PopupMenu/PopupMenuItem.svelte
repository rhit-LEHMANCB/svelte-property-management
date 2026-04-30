<script lang="ts">
	export let onClickFunction: () => void;
	export let text: string;
	export let isDelete = false;

	const variant = isDelete
		? 'variant-filled-error'
		: 'variant-filled-surface bg-surface-100-800-token text-base-token hover:bg-surface-hover-token';
</script>

<button
	onclick={(event) => {
		event.stopPropagation();
		onClickFunction();
	}}
	class={`btn btn-sm ${variant}`}><span><slot name="icon" /></span><span>{text}</span></button
>
