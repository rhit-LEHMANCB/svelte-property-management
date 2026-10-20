# Lifecycle: fix-auth-and-error-statuses

- Branch: `fix-auth-and-error-statuses`
- Stage: 1 Interview
- Review round: 0 of 5
- QA cycle: 0 of 3
- Started: 2026-10-20

## Interview summary
(approved: pending)

**Goal:** fix three small status/markup bugs: #182, #183, #152.
**Scope:**
- #182: `POST /api/signin` catches the `verifyIdToken` error (in `setSessionCookie`) and answers 401 "Invalid ID token"; no cookie is set. Authentication spec gains a "Malformed ID token" scenario beside "Stale ID token".
- #183: the Reset password form submits through the form (`onsubmit`), and the Change Password button gets `type="submit"`, so Enter submits like the other auth forms. The client-side Firebase reset call is kept.
- #152: the property edit load answers 404 "Property not found" for an unknown property, like `leases/new`. The property-management spec's "Unknown property" scenario changes from 500 to 404.
**Out of scope:** #55 and #56. Both are already fixed on `develop` (the reset load throws 400; the form uses `taintedMessage: false`). They are dropped from this change; close them as already fixed.
**Roles:** #182 and #183 are unauthenticated; #152 is admin only.
**Data / rollout:** none; no new env vars or migrations.
**UI:** #183 changes markup only, with no visible change; design pass skipped.
**Acceptance:**
- WHEN `/api/signin` gets a malformed token THEN 401 and no cookie.
- WHEN Enter is pressed in the reset form THEN it submits.
- WHEN an admin opens `/admin/properties/<unknown>/edit` THEN the normal 404 page.
**Tests:** handler tests for the 401 and the 404; the existing reset e2e spec still passes.
**Assumptions:** the edit page's actions are unchanged.

## Gate A
Approved: no
Accepted preflight gaps: none

## Design pass
(stage 2; `skipped (no UI change)`, or the design link, date and decisions; see `references/design-pass.md`)

## Preflight
(table of checks and results, from stage 2)

## Review rounds
(none yet; one line per round: blockers, majors, minors, nits, fixed, rejected with reason)

## Out-of-scope observations
(only QA observations outside this change's scope, to turn into issues at wrap-up; review findings are fixed, never listed here)

## QA report
(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human
(filled in stage 7)

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
