# Lifecycle: upgrade-to-latest-versions

- Branch: `upgrade-to-latest-versions`
- Stage: 0 Intake
- Review round: 0 of 3
- QA cycle: 0 of 3
- Started: 2026-10-06

## Interview summary
(approved: no, pending user confirmation)

**Issue:** #48 "Upgrade SvelteKit and Skeleton to latest versions". Deadline 2026-10-30: Cloud Function `ssrlehmanrealtydev` on Node.js 20 is decommissioned.

**Goal:** Move the app to current majors with no behavior change, and get CI and the Cloud Function onto a supported Node runtime before the deadline.

**Scope**
- PR 1 (urgent, ships first): Node 22 in `.nvmrc` (CI and Firebase read it), `engines`, and the Cloud Function runtime; update `openspec/config.yaml` context. Remove the Node 20 pin reasoning only where it is no longer true.
- PR 2 (one large PR, ordered commits): SvelteKit 1 to 2 (Vite 5, Vitest bump), Svelte 4 to 5, Tailwind 3 to 4, Skeleton 2 to 5 (+ tw-plugin), SvelteKit 2 to 3 and Vite 8. All other dependencies to latest too (firebase, firebase-admin, firebase-functions, stripe, zod, sendgrid, validator, superforms, dev tooling). Each commit group passes lint, check, tests and build.
- Skeleton 5 replaces Modal, Toast, Popup, Autocomplete, Paginator, TabGroup, Drawer, AppShell, AppBar (19 files import Skeleton); custom theme (`theme.ts`) is ported.
- After Tailwind 4, consider Node 24 only if trivial; otherwise stay on 22.

**Out of scope:** new features, UI redesign, fixing unrelated open issues (#36-#46, #54-#60), changing Firestore data or specs.

**Roles:** unchanged. Admin and tenant flows, route protection and unauthenticated redirects must behave exactly as in `openspec/specs/`.

**Data:** none. No Firestore, storage or Stripe changes. Session cookie, auth and webhook behavior unchanged (bugs like #54 stay as-is unless a library bump forces a change).

**Behavior and edge cases:** the existing unit, handler and e2e suites are the regression net and must keep passing (tests updated only for API changes, not behavior). Firebase v9 to latest SDK and firebase-admin 11 to latest are the riskiest non-UI bumps (auth, Firestore, storage, admin init in `src/lib/server/admin.ts`).

**Security:** no new secrets exposed; do not widen what the client bundle receives; keep `$env` usage as is.

**UI fidelity:** same behavior and custom theme colors, similar look; minor visual differences from Skeleton 5 components are acceptable.

**Acceptance (hand-checkable on dev site)**
- WHEN an admin or tenant signs in THEN they land on the correct home and nav matches today.
- WHEN a modal, toast, popup menu, autocomplete, paginator, tab or drawer is used (properties, users, maintenance, payments, profile) THEN it opens, works and closes as before.
- WHEN a payment, insurance upload or maintenance request is submitted THEN it succeeds as before.
- WHEN `npm run lint`, `check`, `test`, `build` run on Node 22 THEN all pass; CI `tests` and `build_and_preview` are green.
- WHEN the deploy runs THEN the Cloud Function uses a supported Node runtime (22) and no Node 20 deprecation warning remains.

**Delivery and fallback:** Node PR merges into `develop` first; then the big PR. If the big PR cannot complete unattended, ship completed self-contained steps (Kit 2, Svelte 5, Tailwind 4 if green) and file an issue for the rest.

**Rollout notes:** no new secrets expected. Node runtime is set in repo config, not GitHub environments. Production deploy picks up Node 22 on next deploy; check the production Cloud Function runtime after Gate B. The local `.env` is stale (see issue #48 note); work uses `.env.example` pointing at dev.

**Assumptions:** `firebase.json` `frameworksBackend` accepts a `runtime` (nodejs22) and Firebase CLI in use supports it; the Skeleton 5 Svelte package is `@skeletonlabs/skeleton-svelte`; Tailwind 4 drops `tailwind.config.ts` in favor of CSS config; Prettier plugin-search-dir flags in `lint` script will need updating. Open issue #35 relates to the Node 20 pin.


## Gate A
Approved: no
Accepted preflight gaps: none

## Preflight
(table of checks and results, from stage 2)

## Review rounds
(none yet; one line per round: blockers, majors, fixed, rejected with reason)

## Deferred findings
(minors, nits and known gaps to turn into issues at wrap-up)

## QA report
(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human
(filled in stage 7)

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
