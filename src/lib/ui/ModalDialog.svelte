<script lang="ts">
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import Field from '$lib/Components/Forms/Field.svelte';
	import { getModalStore, promptProblem, type ModalSettings } from './stores';

	let { settings }: { settings: ModalSettings } = $props();

	const modalStore = getModalStore();

	// svelte-ignore state_referenced_locally
	let value = $state<string | number>(settings.value ?? '');
	let finished = false;
	let problem = $state<string | undefined>();
	let promptInput = $state<HTMLInputElement>();

	// The modal leaves the queue before its callback runs, so the callback can open another modal.
	function finish(result: unknown) {
		if (finished) return;
		finished = true;
		modalStore.close();
		settings.response?.(result);
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (settings.type !== 'prompt') return finish(true);
		const text = String(value ?? '');
		problem = promptProblem(settings, text);
		if (problem) return promptInput?.focus();
		finish(text);
	}

	const Body = $derived(settings.component?.ref);
</script>

<!-- Dialog traps focus, closes on Escape or a press outside, and returns focus to the opener. -->
<Dialog
	open
	onOpenChange={(details) => {
		if (!details.open) finish(false);
	}}
>
	<Portal>
		<Dialog.Backdrop class="bg-surface-950/60 fixed inset-0 z-50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<Dialog.Content
				class="card bg-surface-50-950 border-surface-200-800 max-h-[90vh] w-full max-w-lg overflow-y-auto border p-4 shadow-xl"
			>
				{#if settings.type === 'component' && Body}
					<Body {...settings.component?.props} />
				{:else}
					<form class="space-y-4" onsubmit={submit} novalidate>
						<Dialog.Title>
							{#snippet element(attributes)}
								<h2 {...attributes} class="h4">{settings.title ?? 'Dialog'}</h2>
							{/snippet}
						</Dialog.Title>
						{#if settings.body}
							<Dialog.Description class="whitespace-pre-line">{settings.body}</Dialog.Description>
						{/if}
						{#if settings.type === 'prompt'}
							<Field
								label={settings.title ?? 'Value'}
								srOnlyLabel
								errors={problem ? [problem] : undefined}
							>
								{#snippet children({ attrs, invalid })}
									<input
										bind:this={promptInput}
										class="input"
										class:input-error={invalid}
										bind:value
										oninput={() => {
											// Once shown, the message follows what is typed.
											if (problem) problem = promptProblem(settings, String(value ?? ''));
										}}
										{...settings.valueAttr}
										{...attrs}
									/>
								{/snippet}
							</Field>
						{/if}
						<footer class="flex justify-end gap-2">
							<button type="button" class="btn preset-tonal" onclick={() => finish(false)}>
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
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
