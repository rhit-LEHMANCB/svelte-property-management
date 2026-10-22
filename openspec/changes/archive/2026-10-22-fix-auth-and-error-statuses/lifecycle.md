# Lifecycle: fix-auth-and-error-statuses

- Branch: `fix-auth-and-error-statuses`
- Stage: **complete (archived automatically on 2026-10-22 after the production release `c394477`)**
- Review round: 2 of 5
- QA cycle: 1 of 3
- Started: 2026-10-20

## Interview summary
(approved: yes, 2026-10-20)

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
Approved: yes, 2026-10-22 (user, interactive)
Accepted preflight gaps: emulator e2e runs in CI only

## Design pass
Design pass: skipped (no UI change)

## Preflight
GitHub backend: MCP (gh token fails in this cloud session).

| Check | Result |
| --- | --- |
| git commit and push | ok (branch pushed) |
| GitHub MCP `get_me` | ok (rhit-LEHMANCB) |
| Playwright `qa` project, Chromium | ok |
| QA_* credentials in `.env.qa` (mode 600, gitignored) | ok; trailing spaces trimmed (#190) |
| Dev deploy on `develop` | latest run success |
| lint, check | pass |
| Unit/handler tests (`npm test`) | pass |
| Emulator e2e | cannot run here (jar download blocked); runs in CI only |
| Secrets/variables | none needed |

Stage 5: PR #192 checks green (tests, build_and_preview, CodeQL); merged into develop as 2a7a6a8 on 2026-10-22. Dev deploy run 39808319272 succeeded.

## Review rounds
Round 1: 0 blockers, 2 majors, 2 minors, 1 nit. All fixed: token-error codes only map to 401 (others stay 500) with tests; Enter-key mismatch e2e; `method="POST"` on the reset form; `submitting` guard.
Round 2: 0 blockers, 0 majors, 3 minors, 1 nit. Fixed: `submitting` set before validation; `it.each` over the four token codes; added a no-JavaScript submit e2e check. Nit (main spec still says 500) not changed: the archive workflow syncs the delta spec. Exit.

## Out-of-scope observations
- `POST /api/signin` with no `idToken` or a non-string `idToken` still answers 500 (client input producing a 5xx). Outside this change's scope; file an issue at wrap-up.
- A tenant opening the edit URL of a missing property gets 404, of an existing one 401, so a tenant can tell whether a property id exists (no data exposed). Low; same behavior as `leases/new`. Mention in the issue above or leave.
- The not-found page is bare unstyled "404 / Property not found" text, identical to `leases/new`. Low; a polish issue for later.

## QA report
- Deployed commit: `2a7a6a8` on `develop` (dev site: https://lehman-realty-dev.web.app)
- QA cycle: 1 of 3
- Run at: 2026-10-22
- Result: PASS (0 failing scenarios). One regression check (admin sign-in) timed out once on the first full run (dev cold start, `environment`) and passed on two reruns.
- Evidence branch (screenshots; not to be merged): `qa-evidence/fix-auth-and-error-statuses`. QA specs: `tests/qa/fix-auth-and-error-statuses/`.

| Capability | Scenario | Result | Evidence |
|---|---|---|---|
| authentication | Malformed ID token: `POST /api/signin` with `not-a-token` answers 401 "Invalid ID token", no cookie (`""` and `a.b.c` too) | pass | ![malformed token](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/fix-auth-and-error-statuses/openspec/changes/fix-auth-and-error-statuses/qa/screenshots/authentication-malformed-id-token.png?raw=true) |
| authentication | Valid sign-in still works (admin) | pass | ![admin sign-in](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/fix-auth-and-error-statuses/openspec/changes/fix-auth-and-error-statuses/qa/screenshots/authentication-valid-signin-admin.png?raw=true) |
| authentication | Reset page: "Change Password" is a submit button of the form; Enter shows "Passwords must match", no passwords in the URL | pass | ![reset form](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/fix-auth-and-error-statuses/openspec/changes/fix-auth-and-error-statuses/qa/screenshots/authentication-password-reset-page-form-behavior.png?raw=true) |
| authentication | Reset page with JavaScript disabled: submit puts no passwords in the URL | pass | ![reset no JS](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/fix-auth-and-error-statuses/openspec/changes/fix-auth-and-error-statuses/qa/screenshots/authentication-password-reset-no-javascript.png?raw=true) |
| authentication | `/reset` with a wrong mode or no `oobCode` still answers 400 | pass | status only |
| property-management | Unknown property: `/admin/properties/<unknown>/edit` answers 404 "Property not found", same as `leases/new` (admin) | pass | ![unknown property](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/fix-auth-and-error-statuses/openspec/changes/fix-auth-and-error-statuses/qa/screenshots/property-management-unknown-property.png?raw=true) |
| property-management | Existing property edit page still loads (200, admin) | pass | ![existing property edit](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/fix-auth-and-error-statuses/openspec/changes/fix-auth-and-error-statuses/qa/screenshots/property-management-edit-existing-property.png?raw=true) |
| property-management | Tenant cannot use the admin edit page (401) | pass | ![tenant denied](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/fix-auth-and-error-statuses/openspec/changes/fix-auth-and-error-statuses/qa/screenshots/property-management-tenant-denied-edit.png?raw=true) |
| regression | Admin and tenant top-level pages load; tenant gets 401 on `/admin` | pass | ![admin pages](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/fix-auth-and-error-statuses/openspec/changes/fix-auth-and-error-statuses/qa/screenshots/regression-admin.png?raw=true) ![tenant pages](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/fix-auth-and-error-statuses/openspec/changes/fix-auth-and-error-statuses/qa/screenshots/regression-tenant.png?raw=true) |

Not covered by automation: a real password reset (needs an emailed `oobCode`), a real expired token, a phone viewport, other browsers. The repo's emulator e2e flows were not run against dev.

## Verification checklist for the human
1. **Real password reset end to end** (risk: high). On dev `/signin` use "Forgot password" for a throwaway account, open the emailed link, type a new password and press Enter in the verify field. Expect the success dialog; Continue goes to `/signin?reset=success` with no "Leave site?" prompt; the new password signs in. Needs a real email and `oobCode`.
2. **Mismatched passwords on a real reset link** (risk: medium). Enter different values, press Enter, then click the button. Expect "Passwords must match", no passwords in the URL or history.
3. **Reset form on a phone and with a keyboard/screen reader** (risk: medium). The soft keyboard's Go key submits; focus order is sensible; the error is announced.
4. **Deleted property's edit URL** (risk: medium). As admin create a throwaway property, delete it, then open its saved `/admin/properties/<id>/edit`. Expect 404 "Property not found" and no 5xx in the Cloud Run logs.
5. **Not-found page look** (risk: low). Open `/admin/properties/does-not-exist/edit` on desktop and phone; decide whether the plain page is acceptable.
6. **Production-only risks** (risk: low). No environment variables, secrets, Stripe or domain changes in this change; after the production deploy, `POST /api/signin` with a malformed token should answer 401 and `/admin/properties/<unknown>/edit` 404.

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)

## Archive
Archived automatically on 2026-10-22 after the production release `c394477` ([workflow run](https://github.com/rhit-LEHMANCB/svelte-property-management/actions/runs/39827819535)). That marks this lifecycle complete.
