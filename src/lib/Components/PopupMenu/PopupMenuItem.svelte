<script lang="ts">
	interface Props {
		onClickFunction: () => void;
		text: string;
		isDelete?: boolean;
		icon?: import('svelte').Snippet;
	}

	let { onClickFunction, text, isDelete = false, icon }: Props = $props();

	const variant = isDelete ? 'preset-filled-error-500' : 'preset-tonal-surface';
</script>

<button
	onclick={(event) => {
		event.stopPropagation();
		onClickFunction();
	}}
	class={`btn btn-sm ${variant}`}
>
	<span
		>{#if icon}{@render icon()}{/if}</span
	>
	<span>{text}</span>
</button>
