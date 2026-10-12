import type { Page } from '@playwright/test';

/**
 * WCAG AA text contrast on the current page, measured directly. axe-core's color-contrast rule
 * cannot read the theme's oklch() colors and reports those elements as incomplete instead of
 * failing them, so it passed pages with unreadable buttons.
 *
 * For every visible text node and form control, the text color (with opacity) is compared with the
 * backgrounds of its ancestors composited from the page root. Colors are resolved through a canvas,
 * which accepts any CSS color syntax. Returns one line per element below 4.5:1 (3:1 for large text).
 */
export async function contrastViolations(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
		const rgba = (css: string): number[] => {
			canvas.clearRect(0, 0, 1, 1);
			canvas.fillStyle = '#000';
			canvas.fillStyle = css;
			canvas.fillRect(0, 0, 1, 1);
			const d = canvas.getImageData(0, 0, 1, 1).data;
			return [d[0], d[1], d[2], d[3] / 255];
		};
		const over = (top: number[], bottom: number[]) =>
			[0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
		const channel = (v: number) => {
			v /= 255;
			return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
		};
		const lum = (c: number[]) =>
			0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
		const ratio = (a: number[], b: number[]) => {
			const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
			return (hi + 0.05) / (lo + 0.05);
		};
		const ancestors = (el: Element) => {
			const list: Element[] = [];
			for (let e: Element | null = el; e; e = e.parentElement) list.unshift(e);
			return list;
		};
		const background = (el: Element) =>
			ancestors(el).reduce(
				(bg, e) => {
					const c = rgba(getComputedStyle(e).backgroundColor);
					return c[3] > 0 ? over(c, bg) : bg;
				},
				[255, 255, 255, 1]
			);
		const opacity = (el: Element) =>
			ancestors(el).reduce((acc, e) => acc * Number(getComputedStyle(e).opacity), 1);
		const hidden = (el: Element) => {
			const style = getComputedStyle(el);
			const box = el.getBoundingClientRect();
			return (
				style.visibility === 'hidden' ||
				box.width < 2 ||
				box.height < 2 ||
				// Inactive controls are exempt: disabled ones, and ones still waiting for hydration
				// (app.html's noscript style makes those active when scripts are off).
				!!el.closest('[hidden], [aria-hidden="true"], :disabled, [aria-disabled="true"]') ||
				(!document.documentElement.hasAttribute('data-hydrated') &&
					Number(getComputedStyle(el.closest('[data-needs-hydration]') ?? el).opacity) < 1)
			);
		};

		const elements = new Set<Element>();
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			if (n.textContent?.trim() && n.parentElement) elements.add(n.parentElement);
		}
		document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach((e) => {
			if ((e as HTMLInputElement).value) elements.add(e);
		});

		const failures: string[] = [];
		for (const el of elements) {
			if (el.closest('script, style, noscript') || hidden(el)) continue;
			const style = getComputedStyle(el);
			const bg = background(el);
			const color = rgba(style.color);
			const fg = over([color[0], color[1], color[2], color[3] * opacity(el)], bg);
			const size = parseFloat(style.fontSize);
			const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
			const need = large ? 3 : 4.5;
			const got = ratio(fg, bg);
			if (got < need) {
				const text = (el.textContent?.trim() || (el as HTMLInputElement).value || '').slice(0, 40);
				failures.push(`${el.tagName.toLowerCase()} "${text}": ${got.toFixed(2)} (needs ${need})`);
			}
		}
		return failures;
	});
}
