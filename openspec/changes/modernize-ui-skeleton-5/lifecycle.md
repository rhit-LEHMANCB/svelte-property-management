# Lifecycle: modernize-ui-skeleton-5

- Branch: `claude/practical-ptolemy-axp5zk` (the session's designated branch, created from `origin/develop` at 1f40174)
- Stage: 7 Production PR open; waiting on Gate B (human verifies and merges)
- Review round: 4 (rounds 1 to 3: implementation and the QA cycle 1 fix; round 4: the QA cycle 2 fix); all exited with no blockers or majors
- QA cycle: 3 of 3 (passed)
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
- Round 1 (2026-10-11): 0 blockers, 1 major, 4 minors, 1 nit. Fixed the major: the properties page showed two "Add Property" links when empty and the "No rows" scenario had no test (toolbar hidden when empty; new e2e empties the collection and restores it). Also fixed three minors: `refreshing` is now a counter so overlapping refreshes keep placeholders up; the no-results button is "Show all <list>" so it no longer shares the name "Clear search"; `TenantPicker` clears through an explicit `clear()` instead of an effect that wiped the user's first edit after a selection.
- Round 2 (2026-10-12): 0 blockers, 0 majors, 6 minors, 5 nits. Review loop exits. Fixed the trivial ones: the drawer closes when the window widens past the sidebar breakpoint; the search field's Clear button is outside its label; the #86 "Open the row" scenario now says "the tenant's name" (what the row offers); `design.md` records that `cerberus` passed the contrast scan in both modes. Local suite after the fixes: lint, check, 308 unit/handler tests, build, check:server, e2e 91 passed.

- Round 3 (2026-10-12, QA cycle 1 fix): 0 blockers, 0 majors, 3 minors, 3 nits. Fixed: added an `oklch()` probe to the contrast self-check; stopped exempting `aria-hidden` content (it is still seen), which exposed avatar initials at 3.07:1 light and 1.14:1 dark, fixed with a filled surface preset; documented what the check does not cover (control borders, placeholders, text over images); corrected a stale comment. Kept as history: the ticked tasks 1.2, 1.3, 2.3 and 6.3 that name `cerberus` and axe (section 9 records the change). Local suite: 308 unit/handler, 93 e2e, build, check:server.

- Round 4 (2026-10-12, QA cycle 2 fix): 0 blockers, 0 majors, 4 minors, 1 nit. Fixed: the focus-return flag is set only for plain clicks (a Ctrl/Cmd or middle click opens a new tab without navigating, which would have left it armed); the focus test polls instead of sleeping; the seeded closed request is deleted after the scan. Not changed: focusing the menu button when the window grew past `lg` mid-navigation is a no-op (the drawer is closed by then anyway). Local suite: 308 unit/handler, 94 e2e, build, check:server.

## Deferred findings
- (R3 minor) The contrast check does not measure control borders (3:1), placeholders or text over images; translucent layers are composited over ancestors only.
- (R1 minor) No e2e test that the current page is kept after a row action refreshes the list; covered only by the `clampPage` unit test.
- (R1 minor) Placeholder rows during `refresh()` unmount the row, so a keyboard user loses focus on the control they used (for example the move-in month input). The spec asks for placeholders during refresh; consider keeping rows mounted with `aria-busy` and dimming instead.
- (R2 minor, repeat of R1) Placeholders during `refresh()` unmount row controls; same item as above. Also the move-in month input keeps an invalid value shown if the PATCH fails.
- (R2 minor) The closed-request address link now goes to `/edit` (the old `/view` route does not exist); untested.
- (R2 minor) `RowMenu` matches actions by label; two actions with the same label would collide (no caller does).
- (R2 minor) Two quick photo drags can race: the first to finish clears the optimistic order while the second is in flight.
- (R2 nit) The pagination `nav` wraps Skeleton's Pagination root (a `div`, so no nested landmark today).
- (R2 nit) `page` is clamped only in the derived value; after rows shrink and grow again the list can return to the old page.
- (R1 nit) The profile photo upload still calls `invalidateAll()` on click before the upload finishes (pre-existing); move to `use:enhance` with `refresh()`.
- The implementation commit's message says "Closes #89, #87 and #86", so GitHub closes those issues when the PR merges into `develop`, before the production release. Reopen them if they should stay open until production.

## QA report
### Cycle 1 (2026-10-12, deployed commit b5c058b, run 73)
Result: FAIL, 3 scenarios, one `app bug`. 41 scenario checks passed, covering every `ui-accessibility`, `list-browsing`, `app-platform` and `tenant-assignment` scenario QA could reach, plus the regression pass.
- App bug: filled primary buttons and the current navigation entry measured 3.62:1 (needs 4.5:1) in light and dark, so appearance "Contrast in light mode", "Contrast in dark mode" and "No scripts" failed. The implementer's axe scan had passed because axe cannot read `oklch()` colors and skipped those elements; QA proved it with a low-contrast probe that axe did not report.
- Observations: the search field rendered broken (Skeleton 5 has no `input-group` classes; dark mode showed a white input box); the combobox lists two tenants both named "New User"; search also matches email text (as specified).
- Not covered: the properties empty state on real data, page kept after a refreshing row action, combobox choice submitted with the form on real users.
- Triage: `app bug` → fix branch. Checking every built-in theme's filled 500 pairs showed `cerberus` also fails for error (2.7:1) and warning (3.3:1); only `vintage` passes all four. Fix: theme `vintage`, direct contrast measurement with a self-check (shown to fail on `cerberus` at 3.62:1, matching QA), destructive menu items colored by icon only, search and combobox fields rebuilt. Local suite: 308 unit/handler, 92 e2e, build, check:server. QA evidence of cycle 1 (10 specs, 45 screenshots) is kept for the evidence branch.

### Cycle 2 (2026-10-12, deployed commit be895f0, run 74)
Result: FAIL, 2 scenarios, both `app bug`. Contrast in dark mode, no scripts, no flash, toggle, every list-browsing, app-platform and ui-accessibility scenario except one passed (QA measured ratios itself with a self-checked helper).
- App bug 1: after choosing a link in the phone drawer, focus ended on `<body>` instead of the menu button (SvelteKit's post-navigation focus reset). Spec: "close it ... after a link is chosen, return focus to the menu button".
- App bug 2: light-mode links (`anchor`, vintage primary-600) measured 3.39:1 on the admin closed-requests address link; the same class is used for the user-info dialog's property link. My scan missed it because its data had no such links rendered.
- Not covered (data limits on dev, not failures): all four tenant-assignment scenarios (every unassigned tenant on dev is named "New User", so QA could not safely pick its own); the properties empty state; the combobox submit. These are covered by the e2e suite on the emulators and go to the human checklist.
- Test bugs QA fixed in its own scripts, and one transient 500 from the dev site (environment, passed on rerun).
- Triage: both `app bug` → fix branch. Focus is restored in `afterNavigate` when the drawer closed for a link; light links use primary-900. Each new test was shown to fail without its fix (drawer: focus not on the button; scan: link at 3.39:1, matching QA) and pass with it. QA evidence of cycle 2 (6 specs, 49 screenshots) is kept for the evidence branch.

Review rounds for QA fixes: the skill gives each QA fix "one review round"; round 4 below is that round for cycle 2's fix (rounds 1 to 3 were the implementation and the cycle 1 fix).

### Owner decision after cycle 2 (2026-10-12)
The owner preferred the `cerberus` theme to `vintage` and was not concerned about the filled-control contrast, and asked to go back to `cerberus`. Done on the cycle 2 fix branch (PR #127): theme `cerberus`; the `appearance` spec's contrast requirement now covers body text and links on page, card and dialog backgrounds and names filled color controls (buttons, badges, toasts, current nav entry; 2.7 to 3.6:1) as an accepted exception; light links one shade darker (primary-700) so they still pass. This is an owner-requested scope change after Gate A, so no extra review round was run for it; the full local suite passed.

### Cycle 3 (2026-10-12, deployed commit f19f0bd, run 75): PASS
Result: PASS, 0 failing scenarios; the final full QA run passed 45 of 45 tests. Every changed scenario was covered, including all four tenant-assignment (#86) scenarios (QA picked its own `qa-` tenant by option id) and the cycle 2 drawer fix; the properties empty state was checked with a simulated empty response.
- Contrast: zero text or links below AA outside the accepted filled-control exception, light and dark, on sign-in, reset, every admin and tenant page, menus, dialogs, toasts, the combobox, phone cards and the drawer; the measurement self-checks against low-contrast samples. Filled controls measured 2.7 to 3.6:1, as the spec accepts.
- Observations (not failures): disabled Previous/Next 3.5:1 in light (WCAG-exempt); about 3 of 170 page loads stayed un-hydrated for 20 s or more until reload (not reproduced in a 25-load loop; cause unknown); focus goes to the page body after changing a tenant's move-in month or saving the property form (the row is swapped for placeholders during refresh; matches deferred finding R1/R2); toasts auto-hide after about 5.4 s; a tenant opening an admin URL sees a bare unthemed 401 page; photos could not be judged (the sandbox blocks Storage images); QA's Add User created real welcome emails to the owner's inbox (`+qa` alias).
- Evidence: [screenshots and specs on `qa-evidence/modernize-ui-skeleton-5`](https://github.com/rhit-LEHMANCB/svelte-property-management/tree/qa-evidence/modernize-ui-skeleton-5/openspec/changes/modernize-ui-skeleton-5/qa) (cycle 3 only; masked). Cycles 1 and 2 evidence is not published (cycle 1 screenshots are unmasked).

### Owner feedback after cycle 3 (2026-10-12)
The owner noted that the navigation entries did not fill the sidebar and that many clickable controls kept the arrow cursor in Firefox. Fixed on the same branch flow (PR into `develop`, which the open production PR then carries): the wrapping `<nav>` is full width, and a base-layer rule restores the pointer cursor on enabled buttons, menu items, options, tabs and selects (Tailwind 4 removed it for every browser, not only Firefox). Two new e2e tests each failed without the fix and pass with it; full local suite 308 unit/handler, 96 e2e. Not re-run through independent QA (CSS-only, covered by the new tests); listed in the checklist.

A second note: on a property's Tenants tab the tenant picker's dropdown icon stuck out of the top of its field, and the Add button did not line up with the fields. Causes: Skeleton's base style already centers the combobox trigger with `transform: translateY(-50%)`, and the component added Tailwind's `-translate-y-1/2` on top, a second half-height shift; and the Add button was 4px shorter than the fields, with the two labels at different heights. Fixed by centering the trigger with `inset-y-0 my-auto` and no transform, and laying the row out as two subgrid rows (labels, then controls) so Add stretches to the fields' height in every browser. A new e2e test fails without each part of the fix and passes with it. Not re-run through independent QA (CSS-only, covered by the test); listed in the checklist.

A third note: tenants who share a name looked identical in the add-tenant picker. Each option is now "First Last (email)" (the name alone when there is no email), built in the edit page's load, so the email is also searchable. A new tenant-assignment requirement covers it; a handler test and an e2e with two same-named tenants fail without the change and pass with it. Not re-run through independent QA (a label change covered by the tests); listed in the checklist.

## Verification checklist for the human
Ranked by risk. Do these on the dev site before merging the production PR, then the production-only checks after deploying.

1. **Screen reader pass (high).** NVDA or VoiceOver on the dev site as admin: Users row menu → Delete; View More; a failing sign-in; save a property; property Tabs and the tenant combobox; the phone drawer. Expect titles and bodies announced, tabs "selected", error toast spoken at once and success politely, combobox expanded/collapsed and options read.
2. **Real phones (high).** iPhone Safari and Android Chrome, admin and tenant: Users, Properties, Maintenance, sort select, drawer open/close and scroll behind it, dark mode toggle. Expect no sideways scroll, readable cards, page behind the drawer does not scroll.
3. **Hydration reliability (medium).** Cold cache, "Fast 3G" throttling: load `/signin`, `/admin/users`, `/admin/properties` a dozen times each. Expect buttons usable within a few seconds; note any page stuck with spinners over 10 s (QA saw this about 3 times in 170 loads).
4. **Remove a tenant (#86) on real data (medium).** Property → Tenants: remove → Cancel, remove → Confirm, re-add, click the name. Expect only the confirmation dialog on remove, user-info only from the name.
5. **Tenant with a property, dark mode (medium).** Submit a maintenance request; pay with test card `4242 4242 4242 4242`; return from Stripe. Expect legible pages and toasts.
6. **Focus rings, hover and disabled states (low to medium).** Tab through Users, Properties and a property page in light and dark. Expect a clearly visible focus ring everywhere; the disabled Previous/Next are faint in light mode (accepted by WCAG).
7. **Photos (low).** Property Photos tab on a normal network: upload two, reorder, delete one. Expect images render and order persists.
8. **Navigation, cursors and the add-tenant row (low).** In Firefox and Chrome: the highlighted sidebar entry spans the sidebar, and buttons, row menus, tabs and options show the hand cursor; disabled Previous/Next do not. On a property's Tenants tab, the tenant picker's icon sits inside its field, Add lines up with the fields, and each option shows the tenant's email in parentheses after the name.
9. **Look and feel (low).** Confirm you are happy with `cerberus` and the filled buttons' contrast (accepted in the spec).

Production-only risks:
- **Function dependencies:** `@skeletonlabs/skeleton-svelte` moved to `dependencies` because the server bundle imports its `@zag-js/*` packages; `check:server` passes. After the production deploy, open `/signin` and an admin list page on the production domain and confirm they render (no 500).
- **No new environment variables, secrets or Stripe changes.** Stripe stays in its current mode.
- **Theme and dark mode are client-side only;** a user's saved mode is per browser (`localStorage` key `theme`).
- **Issues #89, #87 and #86 were closed by the merge into `develop`** (commit message keywords), before this release. Reopen them if they should stay open until production.

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
