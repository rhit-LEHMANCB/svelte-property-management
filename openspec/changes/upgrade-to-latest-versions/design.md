# Design

## Context

Current stack: SvelteKit 1.27, Svelte 4.1, Vite 4.4, Tailwind 3.3 with `tailwind.config.ts` and `@skeletonlabs/tw-plugin` 0.2, Skeleton 2.5, Vitest 0.34, `@sveltejs/adapter-auto`, deployed through Firebase Hosting frameworks support (`firebase.json` `frameworksBackend`), which builds a Cloud Function for SSR. CI reads Node from `.nvmrc` (20). Tests exist (unit, handlers, Playwright e2e on emulators, Playwright QA against dev) and are the regression net. Skeleton is used in 19 files, mainly Toast/Modal stores and popups.

## Goals / Non-Goals

**Goals:**
- Node 22 everywhere before 2026-10-30, shipped independently and early.
- Every dependency at its latest stable major, reached in small verified steps.
- Behavior preserved; the existing test suites pass with no changes to expected behavior.

**Non-Goals:**
- Visual redesign, new features, fixing unrelated open bugs (unless an upgrade makes one unavoidable, then note it).
- Node 24 unless it comes for free after Tailwind 4.

## Decisions

1. **Two PRs, Node first.** The runtime deadline is independent of the migration and low risk; shipping it alone removes the deadline pressure from the long migration. Alternative: one PR, rejected because the deadline would depend on the Skeleton rewrite.
2. **Node 22, not 24.** Tailwind 3's bundled jiti fails on Node 24 and Node 22 is untested; Node 22 is supported until later and needs at most a small compatibility fix. If `tailwind.config.ts` fails to load on 22, convert it to a `.cjs`/`.js` config in PR 1 (removes the jiti dependency) rather than waiting for Tailwind 4.
3. **Order of upgrades in PR 2:** Kit 2/Vite 5 → Svelte 5 (+superforms) → Tailwind 4 → Skeleton 5 → Kit 3/Vite 8 → remaining packages. Each step ends with lint, check, tests and build green and is its own commit group, so the fallback (ship the completed steps) can cut at any boundary. Alternative: jump to latest, rejected because failures could not be attributed to a step.
4. **Svelte 5 in compatibility mode first.** Use the official migration script and keep legacy syntax where it still works; do not rewrite components to runes beyond what is required. Skeleton 5 (`@skeletonlabs/skeleton-svelte`) needs Svelte 5 and Tailwind 4.
5. **Skeleton 5 port keeps behavior, not markup.** Replace Modal/Toast/Popup/Autocomplete/Paginator/TabGroup/Drawer/AppShell/AppBar with the Skeleton 5 equivalents or small local components built on Tailwind where Skeleton 5 has none. Wrap toasts and modals in thin local helpers so the 60+ call sites change once. Port `theme.ts` to a CSS theme with the same color values (primary #FFA500 scale and the others). Alternative: rewrite UI with plain Tailwind and drop Skeleton, rejected as out of scope for "upgrade".
6. **Test changes only for API changes.** Handler and unit tests describe behavior; update mocks and imports but never loosen assertions. E2E selectors may change only where Skeleton markup changed, keeping the asserted user-visible text.
7. **Firebase packages to latest** in the same PR after the framework steps, since failures there are in auth/Firestore code and are easier to attribute once the framework is stable. `src/lib/server/admin.ts` init and the client `firebase.ts` are the touch points.
8. **Lint config** moves with the tools: ESLint (flat config if required by plugins), Prettier 3 (drop `--plugin-search-dir`), `svelte-check`, typescript-eslint. Format changes caused by Prettier 3 are applied in a separate commit.

9. **SvelteKit stays on 2.x until Firebase's SSR wrapper supports 3.** Decided during implementation, after the Kit 3 migration itself worked (builds, 193 unit tests, 31 e2e tests). Firebase Hosting's frameworks support runs the app through `firebase-frameworks` (latest 0.11.8, with `firebase-tools` 15.32.1), whose SvelteKit entry imports `@sveltejs/kit/node/polyfills`; SvelteKit 3 no longer exports it, so the deployed function would fail on startup (`ERR_PACKAGE_PATH_NOT_EXPORTED`). The interview approved shipping the completed steps and filing an issue for the rest. The Kit 3 work (config moved into `vite.config.ts`, `#lib` imports, `src/env.ts` with `$app/env/*`, `$app/state`, `tsconfig` extending `$app/tsconfig`, `Handle` from `@sveltejs/kit/hooks`) is kept on `wip/sveltekit-3-migration`.

## Implementation notes

- **Node 24 check (task 4.4):** after Tailwind 4, `npm run build` and `npm test` pass on Node 24.21, so the old jiti restriction is gone. The project stays on Node 22 (supported, and the version Firebase and CI are pinned to); moving to 24 is a one-line follow-up.
- **Skeleton 5 port:** Skeleton 5 provides CSS (themes, presets, buttons, forms) and low-level Zag components, not the store-driven Modal, Toast, Drawer, Popup and Autocomplete of Skeleton 2. The app keeps its call-site API through small local components in `src/lib/ui/` (toast and modal stores, `ModalHost`, `ToastHost`, `Drawer`, `popup` action, `Tab`/`TabGroup`, `Paginator`, `Avatar`, `Autocomplete`) styled with Skeleton 5 classes. The custom theme is `src/theme.css`.
- **Modal body is plain text:** the old modal rendered `body` as HTML, which put user-entered names and titles into HTML. It now renders text and keeps line breaks.

- **Dependencies left behind on purpose (task 7.4):** `@sveltejs/kit` 3 and `@sveltejs/adapter-auto` 8 (decision 9); `@types/node` stays on 22 to match the runtime; `typescript` stays on 6 because `typescript-eslint` and SvelteKit 2 accept it and not 7 yet. Two moderate `npm audit` findings remain in production dependencies (`uuid` below 11.1.1 through `gaxios`) and several in `firebase-tools` and its tree, none fixable without breaking changes.
- **Stripe API version pinned:** `stripe` 23 would send API version `2026-09-30.endive`; the old SDK sent `2023-10-16`. `src/lib/server/stripe.ts` pins `2023-10-16` so requests behave as before. Moving to a newer API version needs its own Stripe test-mode pass.
- **ESLint 10 flat config:** `eslint-plugin-svelte` 3's recommended set adds three rules the existing code breaks (`no-navigation-without-resolve`, `require-each-key`, `no-reactive-reassign`); they are turned off in `eslint.config.js` and left for a cleanup.
- **firebase-admin 14:** the app now initializes with `initializeApp` and `cert` from `firebase-admin/app`.

## Risks / Trade-offs

- [Skeleton 5 is a rewrite, not a bump] → Wrapper helpers, port page by page, rely on e2e plus QA scenarios; fallback ships earlier steps and files an issue.
- [Firebase Hosting frameworks support may lag the newest Kit/Vite/adapter] → Check `adapter-auto` and firebase-tools support at each step with the PR deploy-preview/build; if the deploy path rejects a version, stay on the newest supported one and record it.
- [firebase v9 → latest and firebase-admin 11 → latest change auth/Firestore APIs] → Handler tests with doubles, e2e on emulators, QA on dev.
- [Dev and production Cloud Function runtime setting may not be controlled by `firebase.json`] → Verify via the deploy log and `engines.node`; check the production function after Gate B.
- [Large diff makes review hard] → Ordered commit groups, each reviewed against its group; lockfile churn kept in the group that causes it.
- [Latest versions may have changed since issue #48 was written] → Resolve "latest" at implementation time with `npm view`; record the final versions in the PR.

## Migration Plan

1. PR 1 merges into `develop`; verify the dev deploy log shows Node 22 and no deprecation warning. PR 1 reaches production with the regular production PR.
2. PR 2 merges into `develop`; the dev deploy and QA verify behavior.
3. Rollback: revert the merge commit of the offending PR on `develop`; no data migrations are involved, so rollback is safe.
