<script lang="ts">
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import { IconX } from '@tabler/icons-svelte';
	import { getToastStore } from './stores';

	const toastStore = getToastStore();

	const styles: Record<string, string> = {
		success: 'preset-filled-success-500',
		error: 'preset-filled-error-500',
		info: 'preset-filled-surface-950-50'
	};
</script>

<!-- The group is a polite live region; error toasts are alerts so they are announced at once. -->
<Toast.Group toaster={toastStore.toaster} aria-label="Notifications">
	{#snippet children(toast)}
		<Toast
			{toast}
			role={toast.type === 'error' ? 'alert' : 'status'}
			class="card flex w-[min(92vw,32rem)] items-center gap-4 p-4 shadow-xl {styles[
				String(toast.type)
			] ?? styles.info}"
		>
			<Toast.Message class="flex-auto">
				<Toast.Description>{toast.description}</Toast.Description>
			</Toast.Message>
			<Toast.CloseTrigger class="btn-icon btn-icon-sm" aria-label="Dismiss">
				<IconX size={18} />
			</Toast.CloseTrigger>
		</Toast>
	{/snippet}
</Toast.Group>
