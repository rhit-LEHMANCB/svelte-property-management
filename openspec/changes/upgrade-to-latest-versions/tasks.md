# Tasks

## 1. PR 1: Node 22 runtime (ships first)

- [x] 1.1 Set `.nvmrc` and `package.json` `engines.node` to Node 22; verify `nvm use` gives Node 22 and `npm ci` succeeds
- [x] 1.2 Make `tailwind.config.ts` load on Node 22 (convert it to a `.cjs`/`.js` config if the old jiti fails); verify `npm run build` passes on Node 22
- [x] 1.3 Set the Cloud Function runtime to Node 22 in `firebase.json` or via `engines` per what Firebase frameworks support, and verify with `firebase-tools` dry run or the dev deploy log
- [x] 1.4 Run `npm run lint`, `npm run check`, `npm test` and `npm run test:e2e` on Node 22 and verify all pass
- [x] 1.5 Update the Node notes in `openspec/config.yaml` and any README or workflow comments that still say Node 20 is required; verify with `grep -rn "Node 20\|node 20\|20\.x"`
- [x] 1.6 Add a check or test that the pinned Node is 22 or later (for example a unit test that reads `.nvmrc` and `engines`) and verify it passes

## 2. SvelteKit 2 and Vite 5

- [x] 2.1 Upgrade `@sveltejs/kit` to 2, `vite` to 5, `@sveltejs/vite-plugin-svelte`, `adapter-auto`, `vitest` and `vite-plugin-tailwind-purgecss` as needed; verify `npm ci` resolves without forced peer overrides
- [x] 2.2 Apply the Kit 2 migration (redirect/error no longer thrown, `cookies.set` path required, `preloadData`, tsconfig, `resolvePath`, etc.) and verify `npm run check` is clean
- [x] 2.3 Fix Vitest breakage from the bump; verify `npm test` passes with unchanged assertions
- [x] 2.4 Verify `npm run lint`, `npm run build` and `npm run test:e2e` pass

## 3. Svelte 5 and superforms

- [ ] 3.1 Upgrade `svelte` to 5, `svelte-check`, `eslint-plugin-svelte`, `prettier-plugin-svelte`, `sveltekit-superforms` (and its adapters) and `@sveltejs/vite-plugin-svelte`; verify install succeeds
- [ ] 3.2 Run the Svelte 5 migration tool and fix remaining compile errors, keeping legacy syntax where it still works; verify `npm run check` is clean
- [ ] 3.3 Port the 11 superforms files to the new superforms API and verify the handler and e2e tests that submit forms pass
- [ ] 3.4 Verify `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e` pass

## 4. Tailwind 4

- [ ] 4.1 Upgrade `tailwindcss` and `@tailwindcss/forms` (and the Vite plugin / PostCSS setup) to the Tailwind 4 versions; replace `tailwind.config.ts` with CSS-first config in `src/app.postcss`/CSS; verify `npm run build` passes
- [ ] 4.2 Fix utility renames and removed classes across `src`; verify pages render in the e2e run and key pages look right at desktop and phone width
- [ ] 4.3 Remove the `vite-plugin-tailwind-purgecss` plugin if Tailwind 4 makes it unnecessary; verify the production CSS size is sane
- [ ] 4.4 Verify `npm run lint`, `npm run check`, `npm test`, `npm run build` and `npm run test:e2e` pass; try Node 24 with `npm run build` and record the result in the design notes

## 5. Skeleton 5

- [ ] 5.1 Replace `@skeletonlabs/skeleton` and `@skeletonlabs/tw-plugin` with the Skeleton 5 packages; port `theme.ts` to a CSS theme with the same colors; verify the app builds and brand colors match
- [ ] 5.2 Add local toast and modal helpers on Skeleton 5 and port the 60+ toast and 16+ modal call sites; verify e2e flows that show a notification and a dialog pass
- [ ] 5.3 Port popups, autocompletes, paginators and tab groups (9, 6, 7, 6 usages); verify each page that uses them works by hand and in the e2e/QA scenarios in `specs/app-platform`
- [ ] 5.4 Port the app shell (AppShell, AppBar, Drawer) and navigation; verify role-based navigation and phone-width layout
- [ ] 5.5 Verify `npm run lint`, `npm run check`, `npm test`, `npm run build` and `npm run test:e2e` pass; add or update e2e tests for dialogs, notifications and autocomplete behavior listed in the spec

## 6. SvelteKit 3 and Vite 8

- [ ] 6.1 Upgrade `@sveltejs/kit` to 3 and `vite` to 8 (and matching plugins); apply the Kit 3 migration notes; verify `npm run check` is clean
- [ ] 6.2 Confirm `adapter-auto` and Firebase Hosting frameworks support still build the SSR function; verify `npm run build` and a preview deploy build in CI pass
- [ ] 6.3 Verify `npm run lint`, `npm test` and `npm run test:e2e` pass

## 7. Remaining dependencies

- [ ] 7.1 Upgrade firebase, firebase-admin and firebase-tools to latest; fix `src/lib/server/admin.ts`, `src/lib/firebase.ts` and call sites; verify handler tests and the e2e run on the emulators pass
- [ ] 7.2 Upgrade stripe, zod, `@sendgrid/mail`, validator, `@tabler/icons-svelte`, `google-maps`, `ts-input-mask`, `@floating-ui/dom` and `@types/*`; fix API changes and verify unit and handler tests pass
- [ ] 7.3 Upgrade ESLint, typescript-eslint, Prettier (drop `--plugin-search-dir`), TypeScript and Playwright; apply formatting in a separate commit and verify `npm run lint` passes
- [ ] 7.4 Run `npm outdated` and verify nothing remains outdated, or each exception is recorded with its reason in the PR description

## 8. Integration

- [ ] 8.1 Run the full local gate (`npm run lint`, `npm run check`, `npm test`, `npm run build`, `npm run test:e2e`) on Node 22 and verify green
- [ ] 8.2 Update `openspec/config.yaml` project context (Svelte 5, SvelteKit, Tailwind 4, Skeleton 5, Node 22) and verify it matches `package.json`
- [ ] 8.3 After the dev deploy, verify the dev site loads, sign-in works for both roles and the deploy log has no deprecation warnings

## Workflow follow-up

- Close issue #48 when the production PR merges, or update it with what remains if the fallback was used.
- Verify the production Cloud Function runtime is Node 22 after the production deploy.
