<script lang="ts">
	import { flip } from 'svelte/animate';
	import { createEventDispatcher } from 'svelte';
	import type { PhotoItem } from '../../app';

	export let list: PhotoItem[];
	let isOver: string | boolean = false;

	const dispatch = createEventDispatcher();
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
		const dragged = getDraggedParent(e.target);
		isOver = dragged?.id ?? false;
	}

	function onDragLeave(e: DragEvent) {
		const dragged = getDraggedParent(e.target);
		isOver === dragged.id && (isOver = false);
	}

	function onDrop(e: DragEvent) {
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

		dispatch('sort', newList);
	};
</script>

{#if list?.length}
	<ul class="list-none p-0 flex flex-row flex-wrap">
		{#each list as item, index (item.id)}
			<li
				class="card card-hover bg-surface-200 border-2 border-dashed p-2 transition-all cursor-grab"
				class:border-transparent={item.id !== isOver}
				class:border-surface-500={item.id === isOver}
				data-index={index}
				data-id={item.id}
				draggable="true"
				ondragstart={onDragStart}
				ondragover={(e) => {
					e.preventDefault();
					onDragOver(e);
				}}
				ondragleave={onDragLeave}
				ondrop={(e) => {
					e.preventDefault();
					onDrop(e);
				}}
				animate:flip={{ duration: 300 }}
			>
				<slot {item} {index} />
			</li>
		{/each}
	</ul>
{:else}
	<p class="text-center my-12 text-lg font-bold">No items</p>
{/if}
