<script lang="ts">
	import { getModalStore, type ModalSettings } from './stores';

	export let settings: ModalSettings;

	const modalStore = getModalStore();

	let value = settings.value ?? '';
	let dialog: HTMLDialogElement;

	function open(node: HTMLDialogElement) {
		node.showModal();
	}

	// The modal leaves the queue before its callback runs, so the callback can open another modal.
	function finish(result: unknown) {
		modalStore.close();
		settings.response?.(result);
	}

	function onBackdropClick(event: MouseEvent) {
		if (event.target === dialog) finish(false);
	}
</script>

<dialog
	bind:this={dialog}
	use:open
	aria-labelledby={settings.title ? 'modal-title' : undefined}
	class="m-auto bg-transparent p-0 text-inherit backdrop:bg-black/50"
	on:cancel|preventDefault={() => finish(false)}
	on:click={onBackdropClick}
>
	{#if settings.type === 'component' && settings.component}
		<svelte:component this={settings.component.ref} {...settings.component.props} />
	{:else}
		<form
			class="card bg-surface-100-900 w-[min(92vw,32rem)] space-y-4 p-4 shadow-xl"
			on:submit|preventDefault={() => finish(settings.type === 'prompt' ? value : true)}
		>
			{#if settings.title}
				<header id="modal-title" class="h3">{settings.title}</header>
			{/if}
			{#if settings.body}
				<article class="whitespace-pre-line">{settings.body}</article>
			{/if}
			{#if settings.type === 'prompt'}
				<!-- svelte-ignore a11y-autofocus -->
				<input class="input" bind:value autofocus {...settings.valueAttr} />
			{/if}
			<footer class="flex justify-end gap-2">
				<button type="button" class="btn preset-tonal" on:click={() => finish(false)}>
					{settings.buttonTextCancel ?? (settings.type === 'alert' ? 'Dismiss' : 'Cancel')}
				</button>
				{#if settings.type === 'confirm'}
					<button type="submit" class="btn preset-filled-primary-500">
						{settings.buttonTextConfirm ?? 'Confirm'}
					</button>
				{:else if settings.type === 'prompt'}
					<button type="submit" class="btn preset-filled-primary-500">
						{settings.buttonTextSubmit ?? 'Submit'}
					</button>
				{/if}
			</footer>
		</form>
	{/if}
</dialog>
