import { autoUpdate, computePosition, flip, offset, shift, arrow } from '@floating-ui/dom';
import type { Action } from 'svelte/action';

export type PopupSettings = {
	/** `click` toggles, `hover` shows while hovered, `focus-click` shows on focus or click. */
	event: 'click' | 'hover' | 'focus-click';
	/** The `data-popup` value of the element to show. */
	target: string;
	placement?: 'top' | 'bottom' | 'left' | 'right';
	/** A click inside the popup on an element matching this selector closes it. */
	closeQuery?: string;
};

const DEFAULT_CLOSE_QUERY = 'a[href], button';

/** Shows the element marked `data-popup="<target>"` next to the node, positioned with Floating UI. */
export const popup: Action<HTMLElement, PopupSettings> = (node, settings) => {
	let current = settings;
	let open = false;
	let shown: HTMLElement | undefined;
	let stopAutoUpdate: (() => void) | undefined;

	const content = () =>
		document.querySelector<HTMLElement>(`[data-popup="${current.target}"]`) ?? undefined;

	async function place() {
		const element = content();
		if (!element) return;
		const arrowElement = element.querySelector<HTMLElement>('.arrow') ?? undefined;
		const placement = current.placement ?? 'bottom';
		const {
			x,
			y,
			middlewareData,
			placement: finalPlacement
		} = await computePosition(node, element, {
			placement,
			middleware: [
				offset(8),
				flip(),
				shift({ padding: 8 }),
				...(arrowElement ? [arrow({ element: arrowElement })] : [])
			]
		});
		Object.assign(element.style, { left: `${x}px`, top: `${y}px` });
		if (arrowElement && middlewareData.arrow) {
			const side = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[
				finalPlacement.split('-')[0]
			] as string;
			Object.assign(arrowElement.style, {
				position: 'absolute',
				width: '8px',
				height: '8px',
				transform: 'rotate(45deg)',
				left: middlewareData.arrow.x != null ? `${middlewareData.arrow.x}px` : '',
				top: middlewareData.arrow.y != null ? `${middlewareData.arrow.y}px` : '',
				[side]: '-4px'
			});
		}
	}

	function show() {
		const element = content();
		if (!element || open) return;
		open = true;
		shown = element;
		// Capture phase, because menu items stop their clicks from bubbling.
		element.addEventListener('click', onContentClick, true);
		element.style.display = 'block';
		stopAutoUpdate = autoUpdate(node, element, place);
	}

	function hide() {
		const element = content();
		if (!open) return;
		open = false;
		stopAutoUpdate?.();
		shown?.removeEventListener('click', onContentClick, true);
		shown = undefined;
		if (element) element.style.display = 'none';
	}

	const toggle = () => (open ? hide() : show());
	function onContentClick(event: MouseEvent) {
		const query = current.closeQuery ?? DEFAULT_CLOSE_QUERY;
		if ((event.target as Element | null)?.closest(query)) hide();
	}
	// Focus moving out of both the trigger and the popup closes a focus-click popup.
	const onBlur = (event: FocusEvent) => {
		if (!content()?.contains(event.relatedTarget as Node | null)) hide();
	};
	const onOutside = (event: MouseEvent) => {
		const target = event.target as Node;
		if (open && !node.contains(target) && !content()?.contains(target)) hide();
	};
	const onKey = (event: KeyboardEvent) => {
		if (event.key === 'Escape') hide();
	};

	function bind() {
		if (current.event === 'hover') {
			node.addEventListener('mouseenter', show);
			node.addEventListener('mouseleave', hide);
			node.addEventListener('focus', show);
			node.addEventListener('blur', hide);
		} else if (current.event === 'click') {
			node.addEventListener('click', toggle);
		} else {
			node.addEventListener('focus', show);
			node.addEventListener('click', show);
			node.addEventListener('blur', onBlur);
		}
		window.addEventListener('mousedown', onOutside);
		window.addEventListener('keydown', onKey);
	}

	function unbind() {
		for (const [name, handler] of [
			['mouseenter', show],
			['mouseleave', hide],
			['focus', show],
			['blur', hide],
			['blur', onBlur],
			['click', toggle],
			['click', show]
		] as const) {
			node.removeEventListener(name, handler);
		}
		window.removeEventListener('mousedown', onOutside);
		window.removeEventListener('keydown', onKey);
	}

	bind();
	return {
		update(next) {
			unbind();
			current = next;
			bind();
		},
		destroy() {
			hide();
			unbind();
		}
	};
};
