# Lifecycle: modernize-ui-skeleton-5

- Branch: `claude/practical-ptolemy-axp5zk` (the session's designated branch, created from `origin/develop` at 1f40174)
- Stage: 4 Review (unattended)
- Review round: 0 of 3
- QA cycle: 0 of 3
- Started: 2026-10-11

## Interview summary
(approved: yes, 2026-10-11)

**Goal.** Make the app look and work like a current Skeleton 5 product, on every device, and close the accessibility gaps in the local UI components. Closes #89 (modernize UI) and #87 (accessibility of the local dialog, drawer, tabs, menu, autocomplete), and #86 (remove-tenant button also opens the user-info dialog), which sits in the list rows being rebuilt.

**In scope**
- Replace `src/lib/ui/` (Modal, Toast, Drawer, popup, Tabs, Paginator, Avatar, Autocomplete) with `@skeletonlabs/skeleton-svelte` components (Dialog, Toast, Tabs, Popover/Menu, Combobox, Pagination, Avatar, Navigation/App Bar). Remove `src/lib/ui/` except thin wrappers a call site still needs.
- Full layout redesign: app bar and navigation (rail/sidebar on desktop, drawer on mobile); properties, users and maintenance requests as a table at >= 768px and cards at phone width; cards, empty states, loading states; mobile-first pass on every page.
- Fresh palette: a built-in Skeleton 5 theme, chosen by the implementer for WCAG AA contrast in light and dark, shown in the design for veto at Gate A. Replaces the current orange/black theme (`src/theme.css`).
- Dark mode: follows the OS setting, with a header toggle that overrides it and is remembered in `localStorage`.
- Small UX additions allowed: client-side search and sort on the users, properties and requests lists (no new queries or API changes); loading placeholders and empty states.
- Delete the `.card`, `.list`, `.list-dl` compat CSS once pages use real components.
- Fix #86 inside this change with an e2e test.

**Out of scope**
- Data, API, route, Firestore, Stripe or email changes.
- Tenant dashboard (#43), pagination rework (#44), first-login (#41), reset link on sign-in (#46), and the other P2 bugs.
- Svelte 5 runes rewrite of components; #88 leftovers (lint rules, Stripe pin, Actions versions).

**Roles.** Admin and tenant see the same navigation entries and the same flows as today; unauthenticated users see the sign-in and reset pages restyled. Access control is unchanged.

**Behavior and edge cases.** Every existing flow in `openspec/specs/` still works. Pages must render server-side without JavaScript errors and the hydration gating (`data-needs-hydration` buttons) must keep working. Toasts and dialogs keep their current store-style call API so call sites outside the redesign do not break, or are updated together. Search and sort are client-side only and work within the existing page size; empty states cover zero rows and zero search results.

**Security and privacy.** None changed. No new endpoints, no new data exposed.

**Acceptance (enforced by QA)**
- WHEN a user operates a dialog, menu, tab group, drawer, autocomplete or pagination with the keyboard only THEN focus moves into it, is trapped while a dialog is open, Escape closes it, arrow keys move between tabs and options, focus returns to the opener, and roles/names are exposed.
- WHEN an admin or tenant uses any existing flow THEN it behaves as before, and the existing e2e suite passes without weakened assertions (extend `tests/e2e/specs/app-platform.spec.ts`).
- WHEN an admin clicks remove on a tenant and cancels or confirms THEN only the confirm dialog appears and no user-info dialog opens afterwards (#86).
- WHEN the OS is in dark mode, or the user toggles it, THEN the app is dark and text/controls meet WCAG AA; the choice survives reload.
- WHEN a list has rows THEN it can be searched and sorted; WHEN it has none THEN an empty state shows.
- Not required by the user (QA may still capture them as evidence): Lighthouse >= 95, screenshots at 390/768/1280px.

**Rollout.** No environment variables, secrets or console changes. Dev deploy via `develop`, production by human merge at Gate B.

**Assumptions**
- The change lands in one run on this session's branch, and the diff will be large (~35 Svelte files); the 3-round review limit is the main halt risk.
- The visual and accessibility acceptance items the user did not select (Lighthouse score, screenshots at three widths) are optional evidence, not pass/fail gates.
- #87's items are closed as covered once the Skeleton components replace the local ones and the keyboard walkthrough passes.
- `data-needs-hydration` gating stays; the `pointer-events` limitation noted in #119 is not addressed here.

## Gate A
Approved: yes, 2026-10-11 22:56 UTC, by the user in session chat (palette `cerberus` not vetoed).
Accepted preflight gaps: the Playwright Chromium build mismatch is handled by the container-local link for this run; a proper fix is in progress in a separate session (session_013J1YZ2Vnp7N4fPVrghLxrt, PR into `develop`). The e2e suite runs locally with `JAVA_TOOL_OPTIONS` unset.

## Preflight
Checked 2026-10-11. GitHub backend: **GitHub MCP** (`gh` token is invalid; `get_me` returns `rhit-LEHMANCB`).

| Check | Result |
| --- | --- |
| Git commit and push to `origin` | Pass. Identity set; pushed `claude/practical-ptolemy-axp5zk`. |
| GitHub backend | Pass via MCP (see above). Approving pending workflow runs on the archive PR is a human step in stage 8. |
| `openspec validate --strict` | Pass. |
| Playwright `qa` project | Config present. **Browser build mismatch:** Playwright 1.63 needs Chromium 1243, the container has 1194. Worked around locally by linking the expected path to the installed headless shell (container-only, nothing in the repo); the smoke, sign-in and full e2e suites then ran. The QA agent runs in the same kind of container, so the same link is needed there (create it again in a fresh session). |
| QA credentials | Pass. All four `QA_*` values are in `.env.qa` (mode 600, gitignored), pulled from 1Password; only `lehman-realty-dev` appears in `.env` and `.env.qa`. |
| Dev deploy workflow | Pass. Latest `develop` run (#70) succeeded. |
| Local checks | Pass: Node 22.22.0, lint, `npm run check` (0 errors), 297 unit/handler tests, build. |
| e2e on emulators | Pass (55) with the workaround above and with `JAVA_TOOL_OPTIONS` unset for the run (the sandbox's Java proxy flags print a line that firebase-tools reports as a rules error). CI is unaffected. |
| Secrets for this change | None needed. |
| `production` branch | Exists on `origin`. |

## Implementation (stage 3)
Completed 2026-10-11. All 25 tasks ticked. Local results: lint clean, `npm run check` 0 errors, 308 unit and handler tests, build, `check:server` OK, e2e 90 passed (55 existing plus 35 new, on the production build against the emulators).

Decisions and deviations made while implementing, recorded for the reviewer and the PR:
- Design decision 3 changed: one table restyled as cards below `md`, instead of a table plus a hidden card list. A duplicate DOM gave every per-row control (for example a tenant's move-in month) two labels. `design.md` is updated.
- `@skeletonlabs/skeleton-svelte` moved to `dependencies`: the server build leaves its `@zag-js/*` imports external, so `check:server` failed (the #85 class of deploy break). A unit test guards it.
- `@floating-ui/dom` removed (only the deleted popup action used it); `@axe-core/playwright` added as a dev dependency for the contrast scans.
- Confirm dialogs keep `role="dialog"` (the spec allows dialog or alertdialog; existing specs locate them by `dialog`).
- Small fixes in rebuilt screens: the tenant's closed requests now label the date "Closed" (#57); the admin closed-requests list had its own pager wired to the open list, and its address link pointed at a `/view` route that does not exist; both fixed. The reset page's hover-only password rules are now visible text linked with `aria-describedby`. The photo Delete buttons were invisible until hover (unreachable by keyboard); they are now always shown. The app bar title reads "Lehman Family LLC" (was "LFR Manager").
- Existing e2e specs changed only in selectors (old `ul.list`, `dl > div`, popup buttons → table rows, roles `menuitem`, `option`, `tab`, link "Add Property"), the page-count regex (the new seeded users make 10+ pages, so `[2-9]` became `([2-9]|\d{2,})`), and two maintenance checks that matched the label strings "Submitted By:" and "Work Done:" now check the same values in their table cells. The two theme tests that asserted the old orange were replaced by the current-page test (aria-current, highlight kept on hover) and the new appearance spec, as the modified `app-platform` requirement says.

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
