<script lang="ts">
	import { flip } from 'svelte/animate';
	import type { Snippet } from 'svelte';
	import type { PhotoItem } from '../../app';

	let {
		list,
		onsort,
		children
	}: {
		list: PhotoItem[];
		/** Called with the reordered list after a drop. */
		onsort: (list: PhotoItem[]) => void;
		children: Snippet<[PhotoItem, number]>;
	} = $props();
	let isOver = $state<string | boolean>(false);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function getDraggedParent(node: any) {
		if (!node.dataset.index) {
			return getDraggedParent(node.parentNode);
		} else {
			return { ...node.dataset };
		}
	}

	function onDragStart(e: DragEvent) {
		const dragged = getDraggedParent(e.target);
		e.dataTransfer?.setData('source', dragged?.index.toString());
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		const dragged = getDraggedParent(e.target);
		isOver = dragged?.id ?? false;
	}

	function onDragLeave(e: DragEvent) {
		const dragged = getDraggedParent(e.target);
		if (isOver === dragged.id) isOver = false;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		isOver = false;
		const dragged = getDraggedParent(e.target);
		reorder({
			from: e.dataTransfer?.getData('source'),
			to: dragged.index
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const reorder = ({ from, to }: any) => {
		const newList = [...list];
		newList[from] = [newList[to], (newList[to] = newList[from])][0];

		onsort(newList);
	};
</script>

{#if list?.length}
	<ul class="flex list-none flex-row flex-wrap gap-4 p-0">
		{#each list as item, index (item.id)}
			<li
				class="card bg-surface-100-900 hover:preset-tonal cursor-grab border-2 border-dashed p-2 transition-all"
				class:border-transparent={item.id !== isOver}
				class:border-surface-500={item.id === isOver}
				data-index={index}
				data-id={item.id}
				draggable="true"
				ondragstart={onDragStart}
				ondragover={onDragOver}
				ondragleave={onDragLeave}
				ondrop={onDrop}
				animate:flip={{ duration: 300 }}
			>
				{@render children(item, index)}
			</li>
		{/each}
	</ul>
{:else}
	<p class="my-12 text-center text-lg font-bold">No photos yet</p>
{/if}
