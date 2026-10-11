import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/** WCAG AA color-contrast violations on the current page, as short readable lines. */
export async function contrastViolations(page: Page): Promise<string[]> {
	const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
	return results.violations.flatMap((violation) =>
		violation.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`)
	);
}
