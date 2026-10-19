# Lifecycle: make-ui-consistent

- Branch: `claude/make-ui-consistent`
- Stage: 7 Production PR (#177) and Gate B
- Review round: 4 of 5
- QA cycle: 3 of 3 passed on `d5ba5c4`
- Started: 2026-10-18
- Issue: #154

## Interview summary
(approved: yes, 2026-10-18)

**Goal.** Make every page look and behave the same: one card style, one page width, one place for section headings, one auth card, one button rule, Svelte 5 event syntax only. Also add breadcrumbs on nested pages and show validation errors under each field with a red outline. Shared components enforce the standards, so new pages get them by default.

**Scope.**
- **New components** in `src/lib/Components/Shell`:
  - `PageBody`: a centered `max-w-5xl` wrapper used by every signed-in page. There is no narrower form width.
  - `Card`: `card bg-surface-100-900 p-4 sm:p-6`, an optional `title` rendered as an `h2.h4` first child, and forms and headings inside the padding.
  - `AuthCard`: `max-w-sm p-6 sm:p-8 shadow-xl`, fields `space-y-4`, submit `mt-6 w-full`. Used by Sign in, Forgot and Reset.
  - `Notice`: tonal warning, error or info card with `p-4` and `role="status"` (or `role="alert"` for errors). It replaces the hand-rolled warning and error cards on the dashboard, Maintenance, the lease page and `LeaseForm`.
  - `Breadcrumbs`: a `nav aria-label="Breadcrumb"` with the current page as `aria-current="page"`.
  - `Field`: label, input slot and error text. It sets `aria-invalid`, links the error with `aria-describedby`, and shows the red `input-error` outline.
- **Pages moved onto them:** all 17 pages (3 auth, 14 signed-in), plus `PropertyForm`, `LeaseForm` and `LeaseBilling` where they render cards or fields.
- **Breadcrumbs** on nested pages only:
  - Properties › New property
  - Properties › *property title* (on the edit page)
  - Properties › *property title* › New lease
  - Properties › *property title* › Edit lease
  - Payment › Success

  Each crumb except the last is a link. Top-level pages have no breadcrumbs. They replace the current back links in `PageHeader` children where those are a plain "back" link.
- **Inline field errors** on every form and dialog: Profile, Insurance, Maintenance, Property, Lease, Reset, Sign in, Forgot, Add user, Make a Payment and the autopay amount dialog.
  - Nothing is red before the first submit. After a submit, each field shows its first error under it and updates live as it is fixed (superforms' existing behaviour). There are no new validation rules.
  - Form-level errors (wrong password, server failures) stay in an error `Notice` above the submit button.
  - Success toasts stay.
- **Buttons:** regular size for form submits and page actions, `btn-sm` only in list rows and headers. Form actions sit in a `flex flex-wrap gap-2` footer with consistent top spacing, and no ad-hoc `mt-5` / `mt-3`.
- **Events:** replace the 10 remaining `on:` handlers, in `DateInput`, Sign in, Reset, Profile and Payment. Sign in and Forgot also move from `export let` to `$props()`. A lint check fails the build if a Svelte 4 `on:` directive comes back.
- **Spec:** add the layout standards as requirements in the `appearance` spec, and the breadcrumb and field-error behaviour in `ui-accessibility`.

**Out of scope.**
- Colours, typography, the theme, the sidebar and app bar.
- Dialog layout beyond field errors.
- New validation rules.
- Changing any page's content or data.
- The #138 follow-ups.

**Roles.** No change. Admin-only pages stay admin-only. Breadcrumbs only link to pages the viewer can already open.

**Data.** None. No Firestore, Storage, Stripe or email changes.

**Edge cases.**
- Long property titles truncate in breadcrumbs.
- At phone width, breadcrumbs wrap or collapse to the parent link.
- `PageBody` must not cause horizontal scroll at 360px.
- Pages must stay readable in dark mode and without JS. Sign in and Forgot work without scripts, so their field errors must also render from the server response.

**Security.** None beyond the existing rules. Error text never echoes secrets (it is the same messages as today).

**Acceptance.**
- WHEN any signed-in page is opened on a wide screen THEN its content is centered and at most 1024px wide.
- WHEN any two pages' cards are compared THEN they have the same padding and the section heading sits inside the card.
- WHEN an admin opens Edit lease THEN breadcrumbs read Properties › <title> › Edit lease, and each earlier crumb links to its page.
- WHEN the Profile form is submitted with an empty first name THEN the first-name input has a red outline, `aria-invalid="true"` and the message under it; typing a name clears it.
- WHEN Sign in is submitted with a wrong password THEN an error notice shows above the button (not under a field).
- WHEN `npm run lint` runs on a file with `on:click` THEN it fails.
- WHEN each page is viewed at 375px in light and dark mode THEN there is no horizontal scroll and contrast checks still pass.
- Existing e2e tests pass. Selectors that tests rely on are updated only where the markup must change.

**Rollout.** None: no environment variables, secrets or console changes.

**Assumptions.**
- "Everything capped" applies to signed-in pages. Auth pages keep their small centered card.
- Dialogs keep the `ModalDialog` width.
- "Form errors underneath inputs" uses the server validation already in each superforms schema.
- Dialogs that are not superforms (Payment, autopay, Add user) show their existing checks per field.

## Scope change 2 (2026-10-18, option B)
After QA cycle 1 the owner found loose text on tenant pages. A design pass was published as a canvas: https://claude.ai/artifact/17RZQ1iMPo16m3Dgb8F8LT. The owner then chose to build its direction in this release and hold production PR #177, which is now a draft.

Decisions:
- Build the dashboard tiles and the insurance card.
- Build admin "Needs attention" with real counts.
- Adopt the mockup wording.
- Maintenance gets Open/Closed tabs.
- Add a no-loose-content rule with an e2e check.

Assumptions:
- With several leases, the balance tile shows the total payable now and the earliest due date.
- Insurance counts as "Ending soon" within 30 days.
- Rows at 0 are hidden in "Needs attention".

The revised proposal was approved as a new Gate A on 2026-10-18 ("approve"). Stages 3 to 6 run again for task groups 7 to 10.

## Scope change 3 (2026-10-18, owner feedback)
While QA cycle 2 ran on `a074d8c`, the owner said the dashboard's upcoming-lease notice was redundant and sat outside a card. The notice is removed: the upcoming lease shows in its "Your lease" card, what can be paid now in the balance tile, and autopay and maintenance in their tiles. The no-property warning stays. Spec deltas: `access-control` (Tenant property context, MODIFIED) and a new "Upcoming lease" scenario in `home-dashboards`. Task group 11. It gets one review round, and the next QA cycle covers it.

Later the owner flagged the same problem on Maintenance: "Maintenance requests open when your lease starts" was a notice on the page background. Without a current lease, Maintenance now shows the reason in a "Your requests" card with an empty state, for both cases (upcoming lease, or no property). The `maintenance-requests` "No current lease" scenario names the card. The page-layout "Warning notice" example moves to the dashboard's no-property notice, which still shows. Task 11.2. The round-5 review ran before this part, so it was checked against the specs, the rendering and e2e tests, and the full checks. A sixth review round would exceed the limit.

## Gate A
Approved: yes, 2026-10-18 ("approve")
Accepted preflight gaps:
- 1Password `.env` item lacks the `JOBS_SECRET` line (local copy patched; owner to add it to the item).
- Playwright/Chromium build mismatch in this container (scratchpad `PLAYWRIGHT_BROWSERS_PATH` workaround).

## Preflight
Run 2026-10-18. GitHub backend: **GitHub MCP**. `gh` fails because `GH_TOKEN` is invalid; this is a cloud session, and `get_me` returns `rhit-LEHMANCB`.

| Check | Result |
| --- | --- |
| git commit and push to `origin` | OK: pushed `claude/make-ui-consistent` |
| GitHub backend | OK: MCP (`get_me` works) |
| Env files from 1Password (`scripts/pull-env.sh`) | OK: `.env` and `.env.qa` written, mode 600, gitignored |
| QA credentials (`.env.qa`) | OK: all four set (not printed) |
| Dev deploy (`firebase-hosting-merge.yml` on `develop`) | OK: run 105 succeeded on 6fca372 |
| Dev site reachable | OK: `/signin` returns 200 |
| `npm run lint` | OK |
| `npm run check` | OK after a local fix. The 1Password `.env` item has no `JOBS_SECRET` line, so the check failed. An empty `JOBS_SECRET=` was appended to the local `.env` only, matching `.env.example`. **Gap:** add the line to the 1Password `.env` item. |
| `npm test` | OK: 733 passed |
| Playwright + Java + emulators | OK with a workaround. The installed Playwright expects Chromium build 1243, but the container has 1194. A scratchpad `PLAYWRIGHT_BROWSERS_PATH` symlinks the installed Chromium; the `appearance` e2e spec passed with it. No repo change. |
| `develop` environment secrets for this change | None needed |

## Implementation
Stage 3 done 2026-10-18. All 16 tasks are checked. `npm run lint`, `npm run check`, `npm test` (750), `npm run build` and `npm run check:server` pass. The full `npm run test:e2e` run passed (183) before the last two fixes; after them, the affected specs (page-layout, profile, appearance, autopay) passed again (42).

Found while implementing and folded into the change:
- `input-error` does not exist in Skeleton 5, so invalid fields never had a red outline. `src/app.css` now defines it.
- `text-error-700-300` is 4.11:1 on light cards. Error text uses `-800-200`.
- Sign in's browser-side error toast conflicted with the field-error spec. The `authentication` and `rent-payments` deltas were added.
- `SortablePhotos` still used `on:` with modifiers and was moved to Svelte 5.

## Review rounds
- Round 1 (2026-10-18): 0 blockers, 1 major, 3 minors, 3 nits. All fixed, none rejected:
  - Autopay inline-amount and Change-amount prompt errors are now covered by e2e.
  - The autopay button sits inside the field row; there is no magic offset.
  - Profile's current-password problem is a field error (`setError`).
  - Every superform shows `formProblem($message)` in an error notice.
  - The artifacts match the code.
  - Only the last crumb is `aria-current`.
  - `Notice` `urgent` has a unit test.

  Checks after the fixes: lint, check, 757 unit tests, and the affected e2e specs (53) pass.
- Round 2 (2026-10-18): 0 blockers, 0 majors, 4 minors, 1 nit. The review stage exits after this round. Fixed:
  - e2e asserts the overlap warning is an alert and the no-property notice is a status, both with the shared padding.
  - `formProblem` hides only a real Firestore auto id after `id`.
  - A `required` prompt without `validate` refuses an empty value, since the dialog form is `novalidate`.

  Not changed:
  - The lockfile nit. npm 10.9 only cleared `"dev": true` on `@esbuild/*` platform packages. `esbuild` is already a production dependency on `develop` through `vite` and `tsx`, so production installs do not change.

  Checks: lint, check, 759 unit tests, build, and the affected e2e specs (55) pass.

- Round 3 (2026-10-18, scope change 2): 0 blockers, 1 major, 3 minors, 1 nit. All fixed:
  - Rendering tests for every dashboard and admin home scenario (the major).
  - The autopay tile counts current or upcoming leases, and the spec now says so.
  - Only the latest autopay charge counts as failed.
  - `adminAttention` skips and logs an unreadable lease (allSettled).
  - The dashboard loads each ledger once.
  - The spec scenario says "owed".

  Checks: lint, check (after typing the test helpers for happy-dom) and 782 unit tests pass.

- Round 4 (2026-10-18, scope change 2): 0 blockers, 0 majors, 3 minors, 1 nit. The review stage exits after this round. Fixed:
  - The balance tile shows whenever money is owed, including on an ended lease only. There is a new spec scenario and a rendering test.
  - The handler tests pin the clock.
  - The latest-charge sort is one shared `latestCharge` helper.

  Rejected, with reason: using Firestore `count()` for the open-request counts. The handler tests' fake Firestore has no aggregation queries, the counts are small at this scale, and design decision 15 records the choice.

  Checks: lint, check, 783 unit tests, the build, and the affected e2e specs (68) pass.

- Round 5 (2026-10-18, scope change 3): 0 blockers, 0 majors, 1 minor, 2 nits. This is the last allowed round. All fixed:
  - Tests now cover a tenant whose only lease has ended and still owes: the no-property notice shows with the balance tile. The "Only an ended lease, still owing" scenario says so.
  - The upcoming-lease rendering test checks the Maintenance tile's "Requests open when your lease starts."
  - Removed an extra blank line in `tasks.md`.

## Ship to develop
- 2026-10-18: opened PR #175 into `develop`. Waiting on the required checks `tests` and `build_and_preview`, with a PR activity subscription. Next: merge with a merge commit once both are green, then stage 6.
- Before merging, `develop` had gained the archive of the three payment changes (#171). `develop` was merged into the branch with a merge commit, and the `rent-payments` delta was rebuilt on the archived "Client-side amount limits" text, which keeps the new "Method choice with fees" scenario.
- 2026-10-18 18:25: checks green on `d25d649`. Merged PR #175 into `develop` as merge commit `324e354`. Dev deploy run 107 (firebase-hosting-merge.yml) is queued.

## Scope change 2: implementation
Done 2026-10-18. Groups 7 to 10 are checked. Lint, check, 768 unit tests and the build pass. The full e2e run had 5 failures, all fixed, and the affected specs (77) then passed. The failures:
- section-card `aria-label`s collided with field labels;
- an empty-state assumption in the new tabs test;
- a real dark-mode finding: admin maintenance address links on the card measured 4.48:1. Dark links now use primary-300.

## Out-of-scope observations
- `/api/signin` returns 500 "Internal Error" for a malformed ID token. It should be 400 or 401. No cookie is set, so it is not a security problem.
- The Reset page's "Change Password" button has no explicit `type="submit"` and relies on its click handler.
- In QA tooling, Playwright's `error-context.md` captures typed field values, so a failed `qa` sign-in can write the QA password into `test-results/`. The folder is gitignored, but the `qa` project should turn the snapshot off or mask the password field.

## QA report
- 2026-10-18 18:31: dev deploy run 107 succeeded on `324e354`.
- 2026-10-18 18:33: QA cycle 1 started. It is a fresh agent and was given only the dev URL, the proposal, the delta specs, the QA guide and the report template.

### QA report: make-ui-consistent (cycle 1 of 3)

- Deployed commit: `324e354` on `develop` (https://lehman-realty-dev.web.app)
- Run at: 2026-10-18, about 18:33 to 18:48 UTC
- Result: **PASS**, with no failing scenarios. One scenario could not be reached with the QA accounts (see below).
- Evidence: branch `qa-evidence/make-ui-consistent` (commit `1652607`): 67 screenshots under `openspec/changes/make-ui-consistent/qa/screenshots/` and the QA specs under `tests/qa/make-ui-consistent/`.

| Capability | Scenario | Result | Evidence |
|---|---|---|---|
| page-layout | Wide screen: 9 admin and 5 tenant pages are 1024px wide with equal side gaps | pass | [admin users](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-wide-screen-admin-admin-users.png), [tenant home](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-wide-screen-tenant-home.png) |
| page-layout | List and form pages match: Users and Profile share x and width | pass | [users](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-list-and-form-pages-match-users.png), [profile](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-list-and-form-pages-match-profile.png) |
| page-layout | Phone width (360px) in light and dark: no horizontal overflow on any page, including the auth pages | pass | [admin dark](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-phone-width-admin-dark-profile.png), [tenant light](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-phone-width-tenant-light-home.png) |
| page-layout | Two pages' cards: 24px padding, heading is the first child | pass | [profile](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-two-pages-cards-profile.png), [maintenance](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-two-pages-cards-maintenance.png) |
| page-layout | Dashboard and admin home: same padding | pass | [lease card](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-dashboard-and-admin-home-tenant-lease-card.png), [admin tile](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-dashboard-and-admin-home-admin-tile.png) |
| page-layout | Compare auth pages: same width, padding, shadow, button width and gap | pass | [sign in](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-compare-auth-pages-signin.png), [forgot](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-compare-auth-pages-forgot.png), [reset](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-compare-auth-pages-reset.png) |
| page-layout | Warning notice (role status, tenant with no property) | not covered | The QA tenant has a current lease. It is covered by the emulator e2e test `data-integrity.spec.ts`. |
| page-layout | Warning that stops a save: overlap warning is an alert, 16px padding | pass | [overlap](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-warning-that-stops-a-save.png) |
| page-layout | Form error notice: wrong password shows an alert notice above Sign in | pass | [sign in](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-form-error-notice.png) |
| page-layout | Form submits match: regular buttons, same spacing and gap | pass | [profile](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-form-submits-profile.png), [property](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-form-submits-property.png) |
| page-layout | Row actions use the small size | pass | [maintenance](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-row-actions-maintenance.png) |
| page-layout | Edit lease breadcrumbs, with links | pass | [edit lease](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-edit-lease-breadcrumbs.png) |
| page-layout | Other nested pages: New property, Property edit, New lease, Payment success | pass | [new lease](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-nested-new-lease-breadcrumbs.png), [payment success](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-nested-payment-success-breadcrumbs.png) |
| page-layout | Top-level pages have no breadcrumbs | pass | [dashboard](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-top-level-tenant-dashboard.png) |
| page-layout | Long title on a phone: ellipsis, no horizontal scroll | pass | [property edit](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-long-title-on-a-phone-property-edit.png) |
| page-layout | Missing required field, then fixing it (Profile) | pass | [error](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-missing-required-field-profile.png), [fixed](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-fixing-the-field-profile.png) |
| page-layout | Untouched form: no errors before submit (New lease) | pass | [new lease](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-untouched-form-new-lease.png) |
| page-layout | Without scripts: Forgot shows the error under the email field | pass | [forgot](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-without-scripts-forgot.png) |
| page-layout | Sign-in errors stay form-level | pass | [sign in](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/page-layout-sign-in-errors-stay-form-level.png) |
| page-layout | Svelte 4 event directives rejected by lint | pass | Command output: exit 1 with the rule message, file and line |
| ui-accessibility | Focus an invalid field, then field fixed (Insurance) | pass | [invalid](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/ui-accessibility-focus-an-invalid-field-insurance.png), [fixed](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/ui-accessibility-field-fixed-insurance.png) |
| ui-accessibility | Breadcrumb landmark | pass | [edit lease](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/ui-accessibility-landmark-navigation-breadcrumb.png) |
| authentication | Invalid credentials in the error notice, no toast | pass | [sign in](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/authentication-invalid-credentials.png) |
| authentication | Disabled account, too many attempts, session cookie failure | pass (simulated with route mocks) | [disabled](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/authentication-disabled-account.png) |
| authentication | Successful sign-in and cookie lifetime (Max-Age 432000, HttpOnly, Secure) | pass | [signed in](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/authentication-successful-sign-in.png) |
| authentication | Stale ID token | not covered | Needs a token older than 5 minutes |
| rent-payments | Over balance: message under the field, dialog stays open, nothing sent | pass | [error](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/rent-payments-over-balance.png), [cleared](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/rent-payments-over-balance-cleared.png) |
| rent-payments | Method choice with fees | pass | [dialog](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/rent-payments-method-choice-with-fees.png) |
| regression | 7 admin and 5 tenant pages load with an h1, no console errors and no 5xx; sign out works | pass | [admin users](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/regression-admin-admin-users.png), [tenant payment](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/regression-tenant-payment.png) |

Triage: no `app bug`, `test bug` or `environment` failures on the final run. The QA agent fixed its own early test bugs (selectors, a focus-colour comparison).

QA observations and how they were handled:
- **Dialog footers are not the shared form action row.** In scope as a wording fix. The proposal already puts dialog layout out of scope, so the `page-layout` requirement now says it applies to forms on a page and that dialog footers keep their own layout. No behaviour change.
- **A malformed ID token to `/api/signin` returns 500, not 400 or 401.** This predates the change. Listed under out-of-scope observations.
- **The Reset submit button has no explicit `type="submit"`.** It works, and the behaviour predates the change. Listed under out-of-scope observations.
- **A tenant with no phone number cannot save Profile.** This predates the change, and #119 already lists it.
- **The regular and small button heights differ by only 2px (30 and 28).** This is the theme's sizing and colours and theme are out of scope, so it is recorded here only.

Not covered by automation:
- the no-property warning on the live site;
- a real `/reset` email link;
- a stale ID token;
- the disabled-account and rate-limit states with real accounts;
- the autopay, Add user and DateInput field errors on the live site (each is covered by emulator e2e);
- real screen readers and real phones.

Cleanup: QA's properties were deleted. One record remains: the open maintenance request **`qa-ui-row-action`** in the dev `maintenance` collection. It has no delete API and this session has read-only access, so it is on the human checklist.


### QA cycle 2 (scope change 2), summary
- Deployed commit `a074d8c` (dev deploy run 109). Run 2026-10-18, about 22:00 to 22:15 UTC. The agent was fresh and was given only the dev URL, the proposal, all seven delta specs, the QA guide and the report template.
- Result: **PASS**. The final run was 40 of 40 green, with 64 screenshots in `qa/screenshots/cycle-2/`. Every reachable scenario passed:
  - home-dashboards: balance owed, autopay off, open requests, insurance missing, admin counts, and a tenant blocked from `/admin`;
  - maintenance-requests: tenant and admin Open/Closed tabs;
  - "Page content sits in cards", by an automated scan of 7 tenant views and 8 admin pages plus the property tabs;
  - every page-layout, ui-accessibility, authentication, rent-payments and user-profile scenario it could reach.
- Not reachable with the QA data: nothing owed, ended lease only, autopay on, 2 or more requests, insurance on file, ending soon or expired, all clear, another household, no property, and the overlap warning. All are covered by emulator e2e and rendering tests. They are on the human checklist.
- Triage:
  - **Lease card titled with its address, not "Your lease" (possible app bug, low).** This is spec wording. The card is named "Your lease" for assistive technology and titled with its address, which is needed when a tenant has two leases. The `home-dashboards` requirement now says so.
  - **"Add Maintenance Request" and "Contact Info" in a page-layout scenario (stale wording).** Updated to "New request" and "Contact info".
  - **Cards look flat against the background (info).** This is the theme's surface colours, which are out of scope. It was added to the human checklist.
  - **Profile cannot save without a phone number, and `/api/signin` returns 500 for a malformed token.** Both predate the change and are already recorded.
- Cleanup: the agent created property `bvf8KiUpPY4EJfLtYXww` (a 60-character `qa-` title) for the long-title breadcrumb check. It could not delete it, because the app has no delete-property UI and this session's Firebase connector cannot reach `lehman-realty-dev`. It is on the human checklist. The earlier leftover request `qa-ui-row-action` was gone by the end of the run.
- Scope change 3 came in from the owner while this cycle ran. QA cycle 3 covers it.

### QA report: make-ui-consistent (cycle 3 of 3, final)

- Deployed commit: `d5ba5c4` on `develop` (dev deploy run 110), at https://lehman-realty-dev.web.app
- Run at: 2026-10-18, about 22:35 to 22:55 UTC. The agent was fresh and was given only the dev URL, the proposal, all eight delta specs, the QA guide and the report template. It reused the cycle 2 scripts after checking them against the spec text.
- Result: **PASS**. The final run was 40 of 40 green, with no failing scenarios.
- Evidence: branch `qa-evidence/make-ui-consistent` (commit `ed3ec2b`), holding:
  - 64 cycle-3 and 64 cycle-2 screenshots under `openspec/changes/make-ui-consistent/qa/screenshots/`;
  - the specs each cycle ran, under `tests/qa/make-ui-consistent-cycle-2/` and `-cycle-3/`.

| Capability | Scenario | Result | Evidence |
|---|---|---|---|
| page-layout | Wide screen (1600px): every tenant and admin page at most 1024px wide and centered | pass | [tenant dashboard](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-wide-screen-tenant-dashboard.jpg), [admin profile](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-wide-screen-admin-profile.jpg) |
| page-layout | List and form pages match (Users and Profile) | pass | [users](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-list-and-form-pages-match-users.jpg), [profile](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-list-and-form-pages-match-profile.jpg) |
| page-layout | Phone width 360px, light and dark: no horizontal scroll on 6 tenant and 6 admin pages | pass | [tenant dark](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-phone-width-dark-tenant-dashboard.jpg), [admin light](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-phone-width-light-admin-users.jpg) |
| page-layout | Two pages' cards: 24px padding at 1280px and 16px at 500px, with the heading first | pass | [profile](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-two-pages-cards-profile-1280.jpg), [maintenance](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-two-pages-cards-maintenance-1280.jpg) |
| page-layout | Dashboard lease card and admin home tile share padding | pass | [dashboard](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-dashboard-and-admin-home-tenant-dashboard.jpg), [admin home](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-dashboard-and-admin-home-admin-home.jpg) |
| page-layout | Auth pages: Sign in and Forgot match (Reset needs an emailed link) | pass (partial) | [sign in](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-compare-auth-pages-signin.jpg), [forgot](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-compare-auth-pages-forgot.jpg) |
| page-layout | Form error notice: an alert above Sign in, with no field marked invalid | pass | [sign in](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-form-error-notice-signin.jpg) |
| page-layout | Form submits match: Profile, Insurance, Maintenance and New property | pass | [profile](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-form-submits-match-profile.jpg), [property](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-form-submits-match-property.jpg) |
| page-layout | Row actions use the small size | pass | [properties](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-row-actions-admin-properties.jpg) |
| page-layout | Edit lease breadcrumbs and links | pass | [edit lease](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-edit-lease-breadcrumbs.jpg) |
| page-layout | Other nested pages' breadcrumbs, and none on top-level pages | pass | [new lease](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-nested-breadcrumbs-new-lease.jpg), [payment success](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-nested-breadcrumbs-payment-success.jpg), [payment](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-top-level-no-breadcrumbs-tenant-payment.jpg) |
| page-layout | Long title on a phone: ellipsized crumb, no horizontal scroll | pass | [new lease](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-long-title-phone-new-lease.jpg) |
| page-layout | Missing required field, then fixed (Profile) | pass | [error](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-missing-required-field-profile.jpg), [fixed](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-fixing-the-field-profile.jpg) |
| page-layout | Untouched form (New lease); Dialog field (Make a Payment) | pass | [new lease](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-untouched-form-new-lease.jpg), [dialog](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-dialog-field-make-a-payment.jpg) |
| page-layout | Without scripts (Forgot) | pass | [forgot](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-without-scripts-forgot.jpg) |
| page-layout | Page content sits in cards: Maintenance lists, plus a scan of 6 tenant and 9 admin pages | pass | [maintenance](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-maintenance-lists-tenant.jpg), [property photos](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-every-signed-in-page-admin-property-photos.jpg) |
| home-dashboards | Balance owed: tile equals the Payment page total, with its earliest due date and link | pass | [dashboard](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/home-dashboards-balance-owed-tenant.jpg) |
| home-dashboards | Autopay off, Open requests (1), Insurance missing, Lease and Past leases cards | pass | [dashboard](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/home-dashboards-lease-and-past-leases-tenant.jpg) |
| home-dashboards | Admin counts; a tenant asking for `/admin` gets 401 and no counts | pass | [admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/home-dashboards-counts-admin.jpg), [tenant](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/home-dashboards-tenant-requests-admin.jpg) |
| maintenance-requests | Tenant and admin Open/Closed tabs in one card | pass | [tenant closed](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/maintenance-requests-tenant-switch-tabs-closed.jpg), [admin open](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/maintenance-requests-admin-view-open.jpg) |
| ui-accessibility | Invalid field described, then fixed (Insurance); Breadcrumb landmark | pass (DOM) | [invalid](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/ui-accessibility-focus-an-invalid-field-insurance.jpg), [landmark](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/ui-accessibility-landmark-navigation-breadcrumbs.jpg) |
| authentication | Invalid credentials; disabled, too many attempts and cookie failure (simulated); successful sign-in and cookie lifetime | pass | [invalid](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/authentication-invalid-credentials.jpg), [signed in](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/authentication-successful-sign-in-tenant.jpg) |
| rent-payments | Over balance; Method choice with fees (dialog only) | pass | [over balance](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/rent-payments-over-balance.jpg), [fees](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/rent-payments-method-choice-with-fees.jpg) |
| user-profile | "Send reset link" replaces "Reset" and sends the request | pass | [profile](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/user-profile-reset-button.jpg) |
| regression | Both roles load every top-level page with no console errors; sidebar and sign-out work; Add user dialog errors | pass | [add user](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/make-ui-consistent/openspec/changes/make-ui-consistent/qa/screenshots/cycle-3/page-layout-field-errors-add-user-dialog.jpg) |
| access-control, home-dashboards, maintenance-requests | No property, Upcoming lease, No current lease, Only an ended lease owing, Nothing owed, Autopay on, insurance Ending soon or Expired, All clear, overlap warning | not reachable | The QA tenant has a current lease. Covered by emulator e2e (`data-integrity.spec.ts`, `page-layout.spec.ts`) and rendering tests, and on the human checklist. |

Triage:
- **Intermittent "Sign-in is unavailable right now" (environment, not reproduced).** In two early runs, a cluster of tenant sign-ins failed during bursts of rapid sign-ins and wrong-password attempts. `/api/signin` did not succeed. A probe of three sign-ins in a row and the full final run both passed, with `POST /api/signin` returning 200. This change does not touch `/api/signin` or the session cookie. The likely cause is Firebase Auth throttling or a cold start under burst load. It is on the human checklist with a dev-log check.
- **A first run also ran other changes' QA specs** (`add-autopay`, `add-one-time-bank-payments`) because no path was given. Those results are not part of this change and were ignored. They create Stripe test-mode Checkout sessions only.
- No `app bug` or `test bug` failures.

Observations:
- **Playwright's `error-context.md` holds the page's accessibility snapshot, including typed field values.** A failed QA sign-in can therefore write the QA password into `test-results/`. That folder is gitignored, and the agent deleted it after every run. This is QA tooling, not the app; see out-of-scope observations.
- **`/api/signin` returns 500 for a malformed token.** This predates the change and is already recorded.
- **The dev QA tenant's first name is "New".** That is dev data.

Not covered: everything in the "not reachable" row; the Reset page (needs an emailed link); a stale ID token; real Firebase disabled-account and rate-limit responses; Stripe past the dialog; real screen readers and real phones. Cleanup: no data was created. The long-title check reused the cycle 2 property.

## Verification checklist for the human
Ranked by risk. The same list is in the production PR.

1. **(high) Forms on the production site, after deploy.** Production has real tenants, so check that nobody is blocked.
   - Do: as a tenant, open Profile and Insurance and save each with no changes. Then clear a required field, save, and expect the red outline and the message under the field. Fix it and save.
   - Expect: saving works. The error appears only after Save and clears as you type.
2. **(high) Reset password with a real emailed link,** on a phone.
   - Do: request a reset from `/forgot` and open the emailed link. Submit mismatched passwords, then a weak one, then a valid one.
   - Expect: the errors show under New Password and Verify Password and clear as fixed. The card looks like Sign in and Forgot. You land on Sign in with the "password was changed" message.
3. **(medium) Screen reader pass.** Use VoiceOver or NVDA on Insurance or Profile and on Edit lease.
   - Do: submit an empty required field and Tab to it. List the landmarks on Edit lease.
   - Expect: "invalid" plus the message is read. A "Breadcrumb" navigation landmark is listed, and its last item is the current page.
4. **(medium) Real phones, light and dark.** On an iPhone and an Android phone, open a property with a long title, its Edit lease page, and Payment → Make a Payment with too large an amount.
   - Expect: breadcrumbs shorten with "…" and there is no sideways scroll. The amount message is readable with the keyboard open.
5. **(medium) Tenant with no property or an upcoming lease, on Maintenance and the dashboard.**
   - Expect:
     - With an upcoming lease: the dashboard shows its "Your lease" card with the dates and the tiles, and no separate notice.
     - With no lease: the yellow "No property is assigned" notice.
     - On Maintenance: the reason sits in a "Your requests" card.
   - QA could not reach this state with the QA accounts.
5a. **(medium) Dashboard states QA could not reach.**
   - Do: in dev, use tenants with:
     - nothing owed;
     - only an ended lease that still owes;
     - autopay on;
     - 2 open requests;
     - insurance on file, ending within 30 days, and expired.
   - Then compare two tenants on different properties.
   - Expect:
     - The tiles and the insurance badge match the `home-dashboards` scenarios.
     - The ended-lease-only tenant sees the no-property notice and the balance tile only.
     - Neither tenant's figures change the other's.
6. **(low) Overall look: does the narrower, centered layout suit the list pages on a wide monitor?** Check Users, Properties, Payment and the dashboard. This was a requested design choice; confirm it reads well.
1a. **(high) Sign-in under repeated sign-ins.**
   - Do: on the dev site, sign in and out as the tenant about 10 times in a few minutes, then as the admin.
   - Expect: every valid attempt succeeds.
   - If "Sign-in is unavailable right now" shows, check the dev function logs for `/api/signin`.
   - QA cycle 3 saw it intermittently during bursts and could not reproduce it. This change does not touch sign-in.
6b. **(medium) Stripe past the dialog (test mode).**
   - Do: pay a small amount by card, then by bank account.
   - Expect: Stripe opens with the chosen method and the fee shown in the dialog.
6a. **(low) Card contrast.** On a normal monitor, in light and dark mode, check that cards stand out from the page background. QA found them flat in screenshots. If they are too subtle, a theme follow-up is needed.
7. **(low) Dev cleanup** in the dev Firebase project (`lehman-realty-dev`):
   - Delete property `properties/bvf8KiUpPY4EJfLtYXww`, which has a 60-character `qa-xxx…` title and was left by QA cycle 2.
   - Confirm that the maintenance request `qa-ui-row-action` is gone. QA cycle 2 saw it disappear. If it is still there, delete it from the `maintenance` collection.

Production-only risks:
- **No new environment variables, secrets or Stripe changes.** Production still uses Stripe test mode (#98), which is unchanged by this release.
- **One server-side behaviour change:** Profile now returns a missing or wrong current password as a field error, with HTTP 400 as before. Forgot password adds `field: 'email'` to its 400 response.
- **`happy-dom` is a dev dependency only.** `npm run check:server` passes, so the deployed function's dependencies are unchanged.

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
