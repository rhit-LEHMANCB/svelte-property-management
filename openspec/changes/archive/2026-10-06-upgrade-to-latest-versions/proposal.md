# Proposal

## Why

The deployed SSR Cloud Function runs on the Node.js 20 runtime, which Google decommissions on 2026-10-30; after that date deploys to dev and production fail. The app is also several major versions behind on its framework stack (SvelteKit 1, Svelte 4, Tailwind 3, Skeleton 2, Vite 4), and those old versions block Node 22 and later. See issue #48.

## What Changes

Delivered as two PRs into `develop`, Node first because it is the deadline item.

- **PR 1, runtime:** CI and the Cloud Function move to Node 22 (`.nvmrc`, `engines`, Firebase backend runtime), with whatever minimal compatibility fix the Tailwind 3 / `tailwind.config.ts` loading needs on Node 22. Update the project context in `openspec/config.yaml` that says Node 20 is required.
- **PR 2, framework stack, in ordered commit groups, each green before the next:**
  - SvelteKit 1 to 2 with Vite 5, Vitest bumped to match.
  - Svelte 4 to 5, with `sveltekit-superforms` moved to the version that supports it.
  - Tailwind 3 to 4 (CSS-first config, replacing `tailwind.config.ts`, the PostCSS setup and the purgecss plugin as needed).
  - Skeleton 2 to 5 and the Tailwind plugin; the Modal, Toast, Popup, Autocomplete, Paginator, TabGroup, Drawer, AppShell and AppBar usages are ported and the custom theme (`theme.ts`) is carried over.
  - SvelteKit 2 to 3 and Vite 8.
  - All remaining dependencies to latest: firebase, firebase-admin, firebase-functions (if present), stripe, zod, sendgrid, validator, icons, lint/format/type-check tooling.
- If PR 2 cannot be finished unattended, the completed self-contained steps ship and an issue tracks the rest.
- No feature changes, no data changes, no new secrets. **BREAKING:** none for users; the build toolchain and dev setup change (Node 22 required).

## Capabilities

### New Capabilities
- `app-platform`: the supported runtime the app is built and deployed on, and the guarantee that user-visible UI building blocks (dialogs, notifications, menus, autocompletes, pagination, tabs, navigation shell) and core flows behave the same after dependency upgrades.

### Modified Capabilities

None. Existing behavior specs are preserved unchanged; this change must not alter them.

## Impact

- Config: `.nvmrc`, `package.json` (`engines`, all dependencies, lockfile), `firebase.json`, `svelte.config.js`, `vite.config.ts`, `tailwind.config.ts` / `src/app.postcss`, `theme.ts`, `.eslintrc.cjs`, `tsconfig`, `playwright.config.ts`, GitHub workflows, `openspec/config.yaml`.
- Code: about 25 Svelte files and 36 TS files; 19 files import Skeleton; 11 use superforms.
- Systems: GitHub Actions Node version; Cloud Function runtime for `ssrlehmanrealtydev` (dev) and the production function.
- Out of scope: new features, redesign, open bug issues unrelated to the upgrade, Firestore/Stripe data changes.
