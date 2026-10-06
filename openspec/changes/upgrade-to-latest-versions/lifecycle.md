# Lifecycle: upgrade-to-latest-versions

- Branch: `upgrade-to-latest-versions`
- Stage: 7 Production PR (awaiting Gate B)
- Review round: 1 of 3 (PR 2); PR 1 merged (#75)
- QA cycle: 3 of 3 (passed)
- Started: 2026-10-06

## Interview summary
(approved: yes, 2026-10-06)

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
Approved: yes, 2026-10-06 (user)
`gh pr merge` allowed: confirmed by user.
Accepted preflight gaps: local `npm run build` fails with the stale `.env` and with `.env.example` (placeholder `FB_PRIVATE_KEY`); runs use generated CI-style env values. Local `npm run check` uses `.env.example` values.
Delivery: PR 1 (Node 22, tasks group 1, includes these change docs) from branch `upgrade-to-latest-versions`; PR 2 (groups 2 to 8) from a new branch off updated `develop`.

## Preflight
| Check | Result |
|---|---|
| git identity and push to origin | OK |
| `gh auth` scopes (repo, workflow) | OK (rhit-LEHMANCB) |
| `gh pr merge` permitted in this session | NOT TESTABLE, user must confirm |
| Playwright config with `qa` project, chromium installed | OK |
| QA credentials (4 vars in `.env.qa`, mode 600, gitignored, untracked) | OK, present (values not shown) |
| Dev deploy workflow on `develop` | OK, last 3 runs succeeded |
| `develop` branch protection | Ruleset "Protect develop" is active; required checks `tests` and `build_and_preview` |
| GitHub `develop` environment secrets | 12 present; this change needs none new |
| `npm run lint` | OK (1 warning) |
| `npm test` (190 tests) | OK |
| `npm run test:e2e` (22 tests, Java 26) | OK with `.env.example` values |
| `npm run check` | FAILS with the stale local `.env` (9 errors, issue #48 note); OK (0 errors) when `.env.example` is loaded |
| `npm run build` locally | FAILS with the stale `.env`; also fails with `.env.example` because `FB_PRIVATE_KEY` is a placeholder. CI passes. Unattended runs must build with generated or CI-style values |
| Node 20 locally via `nvm use` | OK |


## Review rounds
PR 1, round 1: blockers 0, majors 0, minors 4, nits 1. Fixed the test-related minors (config load test, engines equals .nvmrc, regex parse). Deferred: ESM tailwind.config.js needs Node 22.12+ for native require(esm) (fine on current 22.x used by CI; consider .cjs if a runtime pins older 22.x); nit: dev deploy log evidence goes in the PR description.

## Deferred findings
To turn into issues at wrap-up:
- SvelteKit 3 and adapter-auto 8: blocked until the Firebase Hosting SSR wrapper (`firebase-frameworks`) supports Kit 3; migration kept on branch `wip/sveltekit-3-migration` (list of required changes in design.md).
- firebase-admin 14: blocked by the `firebase-frameworks` peer range (guarded by a unit test).
- Stripe API version pin 2023-10-16: move to a current API version with a test-mode pass.
- Remove-tenant button also opens the user-info dialog (QA observation).
- Tab roles and focus handling for the local Tabs, Drawer and Modal components (accessibility follow-ups from review).
- Pre-existing and newly surfaced ESLint rules turned off: `svelte/no-navigation-without-resolve`, `svelte/require-each-key`, `svelte/no-reactive-reassign`.
- PR checks only run a build: a preview-deploy or function-install check would have caught the firebase-admin range and the superforms install problems earlier (`check:server` covers the second).
- `actions/checkout@v3` and `actions/setup-node` still run on a deprecated Actions Node runtime (a warning in the deploy log).
- Two moderate `npm audit` findings in production dependencies (uuid via gaxios) and several in firebase-tools.
- ESM `tailwind.config.js` note is obsolete: the Tailwind config no longer exists after Tailwind 4.
- Evidence branch specs (`tests/qa/...`) can be promoted into `tests/e2e` for the covered scenarios (one ESLint finding to fix first).

## QA report
Evidence (screenshots, Playwright specs): branch `qa-evidence/upgrade-to-latest-versions` (not merged). Deployed commit for the final cycle: `e7c9c29` on `develop`, dev site https://lehman-realty-dev.web.app, Stripe test mode.

| Cycle | Commit | Result | What happened |
|---|---|---|---|
| 1 | 4d0d50e | FAIL | App bug: HTTP 500 on every page with a superforms load (/profile, /maintenance, /insurance, /admin/properties/add, /admin/properties/<id>/edit, /reset). Cause: the server build imports `ts-deepmerge` and `memoize-weak` from the bundled sveltekit-superforms, which the deployed function did not install. Fixed in #78 (superforms and firebase to `dependencies`, new `check:server` CI guard). |
| 2 | 8ac2e00 | FAIL (1 scenario) | All upgrade scenarios and form flows passed. App bug that predates the upgrade: after the last photo is deleted `photos: []` made `/admin/properties` return 500. Fixed in #79 with an e2e test. |
| 3 | e7c9c29 | **PASS** | 41 passed, 1 skipped by design (local regression suites cannot run against a deployed site), 0 failing. |

Before cycle 1 the first dev deploy also failed (firebase-admin 14 conflicts with the `firebase-frameworks` peer range); fixed in #77 by pinning firebase-admin to 13.

### Final cycle, scenarios (all pass unless noted)
| Capability | Scenario | Result | Evidence |
|---|---|---|---|
| app-platform | Supported runtime, observable part (site serves) | pass (partial: Node version and deploy log are not visible from a browser) | ![runtime](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-ci-and-deploy-use-the-supported-runtime.png?raw=true) |
| app-platform | Admin confirms a destructive action (delete user; delete property from the directory) | pass | ![confirm user delete, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-admin-confirms-a-destructive-action.png?raw=true) ![confirm property delete, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/property-management-directory-delete-confirmed-toast.png?raw=true) |
| app-platform | Admin cancels a dialog (user, property) | pass | ![cancel, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-admin-cancels-a-dialog.png?raw=true) ![cancel property delete, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/property-management-directory-delete-cancelled.png?raw=true) |
| app-platform | Success notification (tenant maintenance request) | pass | ![success toast, tenant](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-success-notification.png?raw=true) |
| app-platform | Error notification (missing subject keeps values; invalid email toast; invalid zip) | pass | ![error toast, tenant](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-error-notification.png?raw=true) ![validation, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-error-validation-values-kept.png?raw=true) |
| app-platform | Autocomplete selection (tenant picker) | pass | ![autocomplete, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/tenant-assignment-autocomplete-options.png?raw=true) ![assigned, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/tenant-assignment-assigned.png?raw=true) |
| app-platform | Paginated list | pass | ![pagination, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-paginated-list.png?raw=true) |
| app-platform | Tabs (property edit; user dialog) | pass | ![property tabs, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-tabs-property-photos.png?raw=true) ![user dialog tabs, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-tabs-user-info-insurance.png?raw=true) |
| app-platform | Role-based navigation (admin, tenant) | pass | ![admin nav](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-role-based-navigation-admin.png?raw=true) ![tenant nav](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-role-based-navigation-tenant.png?raw=true) |
| app-platform | Small screens at 390px, no horizontal scroll (admin, tenant) | pass | ![drawer, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-small-screens-menu-admin.png?raw=true) ![drawer, tenant](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-small-screens-menu-tenant.png?raw=true) |
| app-platform | Brand theme (buttons are #FFA500) | pass | ![theme, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-brand-theme.png?raw=true) |
| app-platform | Core flows: payment start reaches Stripe test checkout ($10.00 + $0.59 fee) | pass | ![Stripe checkout, tenant](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/app-platform-payment-start.png?raw=true) |
| app-platform | Toolchain on Node 22; regression suites | not observable or skipped on the deployed site (they run in CI: lint, check, 198 unit tests, 35 e2e tests, build, `check:server`) | none |
| property-management | Photo upload then delete, then the directory still lists the property | pass | ![directory after photo delete, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/property-management-directory-after-photo-delete.png?raw=true) |
| property-management | Add, edit (persists after reload), delete through the directory dialog | pass | ![edit, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/property-management-edit-success.png?raw=true) |
| tenant-assignment | Assign, cancel removal, confirm removal | pass | ![removed, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/tenant-assignment-removed.png?raw=true) |
| maintenance-requests | Submit, close dialog (empty note, cancel, close with note) | pass | ![closed, admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/maintenance-requests-admin-closed.png?raw=true) |
| user-profile | Save and reload, invalid rejected, reset request | pass | ![profile saved, tenant](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/user-profile-contact-saved.png?raw=true) |
| renters-insurance | End before start rejected, valid save persists | pass | ![insurance validation, tenant](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/renters-insurance-end-before-start.png?raw=true) |
| authentication | Sign in and out (both roles), wrong password toast, `/reset` wrong mode is 400, valid mode shows the form | pass | ![reset wrong mode](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/authentication-reset-wrong-mode.png?raw=true) |
| access-control, rent-payments, user-management | Tenant gets 401 on admin URLs, amount over balance toast, users list | pass | ![401, tenant](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/upgrade-to-latest-versions/openspec/changes/upgrade-to-latest-versions/qa/screenshots/access-control-tenant-admin-url.png?raw=true) |

### Observations outside the specs
- Low: on a property's Tenants tab the remove-tenant button sits inside the clickable user row, so after Cancel or Confirm the user-info dialog also opens. Probably predates the upgrade (same markup); filed as a follow-up issue.
- Low: the user-info dialog tabs expose no `tab` role (screen readers), same as before the upgrade (they were radio labels).
- Info: no console errors and no HTTP 5xx except the expected ones (QA's own blocked Google Maps requests; edit URL of a deleted property, which the spec documents).

### Not covered by automation
Node 22 runtime and deploy log on the Cloud Function, real emails (password reset, new user), a completed Stripe payment and its webhook, Google Maps address autocomplete (blocked in QA), real phones, keyboard and screen-reader use, photo reorder by drag and drop, large data volumes.

### QA data left on the dev project
Maintenance requests with `qa-` subjects cannot be deleted from the UI (open and closed ones remain). The `qa-c2-*` properties from cycle 2 were deleted in cycle 3 through the directory dialog. `boom` and `qa-property (do not delete)` belong to others and were left.

## Verification checklist for the human
Ranked by risk. Production-only items first, because QA could not reach production.

1. **Production deploy installs and starts the SSR function** (risk: high). Where: the production deploy workflow run, then https://<production site>/signin. Do: after merging, watch the deploy for an `npm install` error; open the sign-in page, then `/reset?mode=bad` (expect a 400 page) and, signed in, `/profile`. Expect: deploy green, pages load, no 500. Why a person: production configuration and the function's install can only be checked there. The first dev deploys failed twice on dependency problems that tests could not see.
2. **Cloud Function runtime is Node 22** (risk: high). Where: Firebase console > Functions (production project) or the deploy log. Expect: Node.js 22 and no "deprecated runtime" warning for the backend function; this must hold before 2026-10-30.
3. **Production environment values still work** (risk: high). Where: GitHub `production` environment secrets and variables. Check: `FB_PRIVATE_KEY` is the JSON-string format (`{"privateKey": "..."}`), `FRONTEND_URL`, Stripe keys are live-mode keys. No new variables were added by this change. Sign in as an admin and as a tenant on production.
4. **Stripe live-mode payment** (risk: high). Where: tenant `/payment`. Do: make a small real payment (or a live-mode test per your practice), return to the app, confirm the payment history and the webhook record. Expect: same amounts and fee as before. Why a person: QA used test mode and stopped at the hosted page. Note: requests are pinned to Stripe API version 2023-10-16 (what the old SDK used); the webhook endpoint keeps its own configured version.
5. **Real password reset and new-user emails** (risk: high). Where: profile "Reset", admin "Add User". Do: trigger both, open the emails, follow the links on the production domain, set a password, sign in. Expect: links open `/reset` with the form on the production domain and the new password works. Why a person: real mail delivery and production authorized domains.
6. **Property address autocomplete (Google Maps)** (risk: medium). Where: `/admin/properties/add`. Do: type a real address, pick a suggestion. Expect: street, city, state and zip fill in; the popup does not overlap other elements. QA blocked Maps requests.
7. **Phone check** (risk: medium). Where: a real phone, both roles. Do: open the menu drawer, visit every page, open dialogs, upload a property photo from the camera. Expect: nothing cut off, no sideways scroll, dialogs usable with the keyboard up.
8. **Look and feel against the old site** (risk: low). Where: any page. The styling framework changed (Skeleton 5, Tailwind 4); layout and brand colors are kept but small differences in spacing, fonts or card shading are expected and acceptable.
9. **Keyboard and screen reader on dialogs, menus and tabs** (risk: low). Tab, Enter and Escape through the row menu, a delete dialog and the tabs; note that the user-info dialog tabs have no `tab` role (as before the upgrade).


## Halted
(only if the run halted: stage, reason, evidence, next step for a human)

## Progress notes
- PR 1 (#75) merged into `develop` 2026-10-06; dev deploy succeeded on Node 22 and the deploy log has no function-runtime deprecation warning.
- PR 2 branch `upgrade-framework-stack`: tasks 2 to 8.2 done. SvelteKit 3 is deferred (Firebase Hosting SSR wrapper imports a module Kit 3 removed); the finished migration is on `wip/sveltekit-3-migration`.
- PR 2 CI fix 1 of 2: the `tests` job failed because Vitest 5 (Vite 8) reads `.svelte-kit/tsconfig.json`, which only exists after `svelte-kit sync`; the test scripts now run it first.
- PR 2 review round 1: blockers 0, majors 1, minors 6, nits 1. Fixed: popup menus now close on item click and on blur (major); duplicate modal triggers queue distinct modals; prompt value is always a string (a payment of 0 now shows the validation message); toast ids use a counter; modal gets a per-instance title id, aria-label for untitled modals and a press-and-release backdrop check; drawer is a labelled modal dialog and only handles Escape when open; tabs drop misleading ARIA roles; navigation hover no longer overrides the active highlight; missing bedrooms, bathrooms and rent keep the "Required" message; schema message tests added. Not changed: `<script context="module">` and `on:` legacy syntax in the new UI layer (works in Svelte 5, matches the rest of the app).
- PR 2 merged (#76). The dev deploy then failed: `firebase-frameworks` 0.11.8 (added to the deployed function by firebase-tools) accepts firebase-admin up to 13, and PR 2 had moved to 14, so the function's `npm install` hit ERESOLVE. PR checks only run `build`, so they could not catch it. Fix-forward PR `fix-firebase-admin-13` pins firebase-admin to ^13 (no code change; `cert` and `initializeApp` exist in 13), adds a unit test guarding the range, and was verified by reproducing the function install and booting the SSR entry locally. No extra review round: a dependency pin back by one major with no code change.
- QA cycle 1 (against 4d0d50e): FAIL. App bug: HTTP 500 on /profile, /maintenance, /insurance, /admin/properties/add, /admin/properties/<id>/edit and /reset. Cause (reproduced locally with the function's dependency set and Firebase's SSR entry): the server build imports `ts-deepmerge` and `memoize-weak` (dependencies of the bundled sveltekit-superforms), which the deployed function does not install because superforms was a devDependency. Fix branch `fix-function-runtime-deps`: superforms and firebase moved to dependencies, new `check:server` guard in the PR workflow. After merge: QA cycle 2.
- QA cycle 2 (against 8ac2e00): FAIL on one scenario, otherwise all upgrade scenarios and the form flows passed (40 tests, 39 passed, 1 skipped). App bug A1, present before the upgrade: after the last photo of a property is deleted Firestore keeps `photos: []`, and `/admin/properties` rendered `photos[0].photoUrl` for any truthy `photos`, so the directory returned 500. Fix branch `fix-empty-photos-list` (`photos?.length`) with an e2e test that fails without it; one review round: 0 blockers, 0 majors, 2 minor test points fixed. After merge: QA cycle 3.
- Observation O1 from QA (not fixed here, to be filed as an issue): on a property's Tenants tab the remove-tenant button sits inside the clickable user row, so Cancel or Confirm of its dialog is followed by the user-info dialog. O2: user-info dialog tabs expose no `tab` role.
- QA data left on the dev project (human cleanup, dev Firestore): properties `qa-c2-1791304726840` (empty photos array, breaks the directory until the fix is deployed), `qa-c2-1791304569160`, `qa-c2-1791304997568`; the QA tenant has an insurance policy `qa-c2 Insurance` / `QA-1` saved (it had none before); open and closed `qa-` maintenance requests cannot be deleted from the UI.
