# Proposal

## Why

The app has no automated tests; CI runs only lint, `svelte-check` and the build, which catch type and syntax breakage but not behavior changes. Issue #48 plans five major upgrades (SvelteKit, Svelte 5, Tailwind 4, Skeleton, Vite) that change reactivity, form and cookie handling, and every modal, popup and toast. Without tests, each hop is verified by clicking through the app by hand. Tests must exist first so the upgrades can be judged against current behavior.

## What Changes

- Add Vitest unit tests for the zod schemas and the server auth helpers.
- Add Vitest tests for the `src/routes/api/*` handlers and the `(authenticated)` form actions and loads, with Firebase Admin, Stripe and SendGrid replaced by test doubles.
- Add 4 to 5 Playwright smoke tests that drive the real app against the Firebase emulators.
- Add `npm` scripts for each layer and a test step in the PR check workflow, so a failing test blocks a PR.
- Use the existing specs in `openspec/specs/` as the test plan: each WHEN/THEN scenario of current behavior becomes a test, named after the scenario. "Not yet implemented" requirements and Known Gaps are not asserted.
- Make only the production-code changes needed for testability (emulator and stub switches). No behavior changes.

## Capabilities

### New Capabilities
- `test-suite`: What the project's automated tests guarantee: which layers exist, that they run without real credentials, that they gate PRs, and that they track the behavior specs.

### Modified Capabilities

None. No existing requirement changes; the tests describe the behavior in the current specs as it is.

## Impact

- **New dev dependencies:** `vitest` (0.34.x, the line that supports Vite 4), `@playwright/test`, `firebase-tools` (emulators).
- **New files:** `vitest.config.ts`, `playwright.config.ts`, `tests/**`, `firebase.json` emulator section, test env fixture.
- **Changed:** `package.json` scripts, `.github/workflows/firebase-hosting-pull-request.yml`, plus small emulator/stub hooks in `src/lib/firebase.ts`, `src/lib/server/admin.ts` and `src/lib/server/stripe.ts`.
- **CI:** the PR check gets slower (Playwright browsers, emulators). The emulator runs need Java, which GitHub's `ubuntu-latest` runner already has; local runs need a JRE.
- **Later work:** the layer 1 and 2 tests avoid Svelte and Skeleton so they survive the #48 upgrades unchanged. Vitest must be bumped when Vite moves past 4.
