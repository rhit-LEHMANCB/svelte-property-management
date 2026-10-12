// Light and dark mode. The inline script in src/app.html applies the saved choice (or the system
// setting) before the first paint; this module reads and changes it afterwards.

export type ColorMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

/** The mode currently applied to the page. */
export function currentMode(root: HTMLElement = document.documentElement): ColorMode {
	return root.classList.contains('dark') ? 'dark' : 'light';
}

/** Applies a mode to the page and remembers it, ignoring browsers that block storage. */
export function setMode(mode: ColorMode, root: HTMLElement = document.documentElement) {
	root.classList.toggle('dark', mode === 'dark');
	root.classList.toggle('light', mode === 'light');
	try {
		localStorage.setItem(THEME_STORAGE_KEY, mode);
	} catch {
		// Private windows or blocked site data: the choice lasts for this page only.
	}
}
