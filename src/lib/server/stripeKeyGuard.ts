const DEV_PROJECT_ID = 'lehman-realty-dev';

// Firebase emulator and test projects use ids that start with `demo-`.
const isProductionProject = (projectId: string) =>
	projectId !== DEV_PROJECT_ID && !projectId.startsWith('demo-');

/**
 * Keeps Stripe's modes apart from the environments: a live key must never run outside production
 * (it would charge real cards from the dev site), and a test key in production only logs a warning
 * so that the production deploy keeps working until the account is activated for live payments.
 * Only the key's prefix is read; the key itself is never printed.
 */
export function checkStripeKeyMode(
	apiKey: string,
	projectId: string,
	warn: (message: string) => void = console.warn
) {
	const live = apiKey.startsWith('sk_live_') || apiKey.startsWith('rk_live_');
	const production = isProductionProject(projectId);

	if (live && !production) {
		throw new Error(
			`A live-mode Stripe key is configured for the non-production project "${projectId}". ` +
				'Use a test-mode or sandbox key (sk_test_ or rk_test_) outside production.'
		);
	}
	if (!live && production) {
		warn(
			'WARNING: production is running with a Stripe test-mode key, so payments are not real. ' +
				'Replace STRIPE_API_KEY and STRIPE_ENDPOINT_SECRET with live-mode values once the Stripe account is activated.'
		);
	}
}
