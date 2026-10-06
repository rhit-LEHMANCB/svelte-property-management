<script lang="ts">
	export let onClickFunction: () => void;
	export let text: string;
	export let isDelete = false;

	const variant = isDelete
		? 'preset-filled-error-500'
		: 'preset-filled-surface-100-900 hover:preset-tonal-surface';
</script>

<button
	on:click={(event) => {
		event.stopPropagation();
		onClickFunction();
	}}
	class={`btn btn-sm ${variant}`}><span><slot name="icon" /></span><span>{text}</span></button
>
