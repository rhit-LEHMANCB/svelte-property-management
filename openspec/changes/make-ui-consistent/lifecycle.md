# Lifecycle: make-ui-consistent

- Branch: `claude/make-ui-consistent`
- Stage: 5 Ship to develop
- Review round: 2 of 5
- QA cycle: 0 of 3
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

## Out-of-scope observations
(only QA observations outside this change's scope, to turn into issues at wrap-up; review findings are fixed, never listed here)

## QA report
(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human
(filled in stage 7)

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
