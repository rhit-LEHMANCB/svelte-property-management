# Lifecycle: p1-data-integrity-fixes

- Branch: `p1-data-integrity-fixes`
- Stage: 6 QA on the dev site (halted, see Halted)
- Review round: 1 of 3
- QA cycle: 1 of 3
- Started: 2026-10-07

## Interview summary
Approved: yes (2026-10-07)

**Goal.** Close the five open P1 issues (#38, #39, #40, #45, #58) in one change and one PR so deleting, assigning, creating and editing records can no longer leave the app in a state that 500s every page, and so early input is not silently lost.

**Packaging.** One OpenSpec change, one review loop, one QA run, one production PR. Closes #38, #39, #40, #45, #58.

**In scope**
- #38 Delete property: delete the property's `junction_user_property` rows, its maintenance requests, its `payment_history` subcollections, and storage files; all Firestore deletes are awaited and run in chunked batched writes (500 ops per batch).
- #39 Assign tenant: reject with 409 if the tenant already has any property (re-adding the same tenant to the same property stays idempotent); 404 if the user or property does not exist; 400 if the user is an admin. The assignable list excludes admins and tenants who already have a property and no longer uses the Firestore `not-in` query (query admins out by `permissions`, filter assigned tenants in memory).
- #40 User create: compensating cleanup. On failure at any step, delete the Stripe customer and the Auth user already created and return the error. The welcome email is awaited; if it fails the whole create is rolled back (Firestore doc, Stripe customer, Auth user). User delete: remove the user's `junction_user_property` rows and their Stripe customer along with the Auth user, Firestore doc and storage files; maintenance requests and `payment_history` are kept for records. An admin cannot delete their own account (400).
- #45 Profile save: order is Auth, Stripe, Firestore last; if a later step fails, earlier steps are restored to the previous values and the user sees an error. Changing the email requires the current password, verified server-side; other fields do not. One new "Current password" field appears on the profile form when the email is edited.
- #58 Hydration: a shared "hydrated" flag (set in `onMount`) disables interactive controls and shows a spinner/skeleton until hydration completes on: the sign-in form, the payment page "Make a Payment" button, the admin maintenance close button, and the modal/dialog triggers app-wide. Sign-in also gets a real `<form method="POST">` with a progressive-enhancement action so it works before (or without) JS.

**Out of scope.** Photo endpoints not checking property existence; the `moveInMonth` backfill gap; new Firestore/Storage rules (#105/#106); SendGrid replacement (#90); Skeleton UI modernization (#89); the other P2 browser-behaviour bugs (#46, #55, #56); data migration of existing dangling junctions.

**Roles.** Admin-only endpoints stay admin-only. Any signed-in user can edit their own profile. Unauthenticated users see only sign-in/reset.

**Data changes.** No new collections or fields. Existing orphan junctions are not migrated.

**Edge cases.** Stripe customer already gone on user delete: treated as success. Auth user already gone: treated as success. Failure mid-delete returns 500 and is safe to retry. Rollback itself failing is logged and surfaced in the error.

**Security.** The current-password check for email change must not log or return the password; it uses the Firebase Auth REST sign-in with the project's web API key. A tenant cannot reach any of these admin endpoints.

**Acceptance (WHEN/THEN)**
1. WHEN an admin deletes a property with a tenant, maintenance requests and payment history THEN none of those docs remain and the tenant's next page load does not 500.
2. WHEN an admin assigns a tenant who already has a property THEN 409 and the toast says so; the assignable list never shows admins or already-assigned tenants, even with more than 10 tenants.
3. WHEN user creation fails after the Auth user is made THEN no Auth user or Stripe customer remains; WHEN the welcome email fails THEN nothing remains.
4. WHEN an admin deletes a user THEN their junctions and Stripe customer are gone; WHEN an admin deletes themselves THEN 400.
5. WHEN a profile save fails at Stripe or Firestore THEN Auth and Stripe are restored; WHEN the email changes without the correct current password THEN the save is rejected and nothing changes.
6. WHEN the user types immediately after the sign-in page appears THEN controls show a spinner/skeleton and are disabled until ready, and a submit before hydration still signs in via the POST form.

**Rollout.** No new secrets expected. The password re-check needs the web API key already present as `PUBLIC_FB_API_KEY` (to be confirmed during design). No Stripe or Firebase console changes.

**Assumptions.** Maintenance requests and payment history of a deleted user are retained. Stripe customer deletion is irreversible and accepted. Rolling back a profile change restores the previous name/email/phone on Stripe and the previous email on Auth.

## Gate A
Approved: yes (2026-10-07, by the user in chat). `gh pr merge` confirmed allowed. `.env.qa` copied from the main checkout (4 QA variables present, gitignored).
Accepted preflight gaps: none (CRLF-only Prettier warnings are local and environmental)

## Preflight
Run 2026-10-07.

| Check | Result |
|---|---|
| git identity and push to `origin` | OK (Caleb Lehman, noreply email, https remote) |
| `gh auth status` scopes | OK (`repo`, `workflow`) |
| `gh pr merge` permitted in this session | NOT TESTABLE; needs user confirmation. If not allowed, the run halts at stage 5 |
| Playwright config with `qa` project, browsers installed | OK (chromium-1243 installed) |
| QA credentials (`QA_ADMIN_*`, `QA_TENANT_*`) | MISSING: not in the environment and no `.env.qa` (it is gitignored). Stage 6 would halt |
| Dev deploy workflow passing on `develop` | OK (last 3 runs success) |
| `nvm use` / Node | OK (v22.23.2) |
| `npm run check`, `npm test` | OK (254 tests pass) |
| `npm run lint` | Prettier warns on 137 files locally only because of Windows CRLF checkout (`core.autocrlf=true`); eslint is clean. CI on Linux is unaffected |
| Java for emulators (e2e) | OK (OpenJDK 21) |
| GitHub `develop` environment secrets | OK, no new secrets needed (uses existing `FB_API_KEY`) |

## Review rounds
Round 1 (2026-10-08, fresh Sonnet reviewer, PR #110): blockers 0, majors 0, minors 5, nits 1. Nothing to fix; exited the loop. Minors deferred below.
Fix round (PR #113, QA finding): fresh reviewer, blockers 0, majors 0, nits 2 (cookie assertion in the new e2e test; only the sign-in button is exercised). Not changed.

## Implementation notes
Stage 3 done 2026-10-08: 21/21 tasks. `npm test` 292 pass, `npm run check` clean, eslint clean, Prettier clean with `--end-of-line auto`, `npm run build` ok, full e2e 53 pass. `npm run check:server` fails on Windows only (pre-existing path bug in scripts/check-server-imports.mjs: `C:C:...`); CI on Linux runs it.

## Deferred findings
- **SPEC CONFLICT for the human at Gate B:** the in-flight `replace-sendgrid-email` change (merged to develop while this ran) specifies "Welcome email failure: the user is still created ... as the welcome email is not awaited". This change, by the user's explicit interview decision, awaits the email and rolls the whole create back on failure (#40). Merge resolution kept this change's behavior and removed the upstream test that asserted the old behavior. Whichever behavior is wanted, `openspec/changes/replace-sendgrid-email/specs/authentication/spec.md` (Welcome email failure) and this change's `user-management` delta must be reconciled before archive.
(minors, nits and known gaps to turn into issues at wrap-up)
- Raw provider error text (Firebase, Stripe, storage) is returned in 500 bodies on property delete, user delete and user create; keep detail in logs (not a regression).
- Sign-in action: map Firebase `USER_DISABLED` / `TOO_MANY_ATTEMPTS_TRY_LATER` to a specific message, and wrap `setSessionCookie` in the same try/catch so a verify failure shows the form error, not a bare 500.
- Hydration gating uses `pointer-events: none` only; keyboard activation (Tab then Enter/Space) before hydration is still dropped. Consider `aria-disabled`/`disabled` on server-rendered buttons.
- Profile password check verifies against the Firestore email, not the Auth email; if the two already disagree a correct password is rejected. Consider `adminAuth.getUser(userId).email`.
- User delete runs the irreversible Stripe delete first; a later failure leaves a user whose `stripeID` is dead until the delete is repeated (accepted in design; retry is tested).
- Property delete of a non-existent id returns 200 (keeps repeat deletes idempotent).
- `scripts/check-server-imports.mjs` fails on Windows (`C:C:...` path); CI on Linux is unaffected.

## QA report
Cycle 1 (2026-10-08 04:45 UTC, deployed develop incl. PR #110 merge 6d4a43a): 28 QA tests, 27 pass, 1 fail. Evidence: branch `qa-evidence/p1-data-integrity-fixes` (30 screenshots in `openspec/changes/p1-data-integrity-fixes/qa/screenshots/`, specs in `tests/qa/p1-data-integrity-fixes/`).

- **App bug (fixed, PR #113):** with JavaScript off, the Sign in button stayed `pointer-events: none` with a spinner, because the `<noscript>` override had the same specificity as the app stylesheet and was linked before it. Enter-key sign-in worked; mouse clicks did not. Fixed with `!important`; new e2e test with `javaScriptEnabled: false`.
- **Environment / test bug (needs a human):** the QA agent's cleanup helper matched the QA tenant (`...+qa-tenant@...`) and deleted it through the app's Delete user endpoint. The QA tenant login in `.env.qa` no longer works (INVALID_LOGIN_CREDENTIALS). The helper is fixed. The QA admin survived (the app refuses to delete the signed-in admin). All tenant-side checks were not run: tenant regression pass, Make a Payment before hydration, tenant profile scenarios, and a tenant of a deleted property loading the app.
- Passed: assignment (assign, missing tenant, unknown user/property, admin as tenant, options, 409, same property), delete property cascade (property + junction rows), create user (new user, duplicate Auth, welcome-email failure rolls back with no user document left), delete user (user and junction row gone), profile invalid form and wrong/missing password (email unchanged), sign-in before hydration (no JS, scripts blocked, typed early, wrong credentials), click before hydration inert with spinner, after hydration works, admin regression (5 pages, no console errors).
- Not covered by automation: property delete over 500 docs and failure retry; maintenance/payment_history/storage removal; Stripe-call and Firestore-write failure injection; delete self (400) deliberately not exercised; profile valid update and correct-password email change (would alter a shared account); more than 10 tenants (dev has 3 users).
- Observations: the assignable dropdown shows names only (every new user is "New User"); the Add User failure toast is generic ("Error creating user.") even though the API returns the Resend message; Resend rejects example.com recipients so Add User only works with real or `delivered+...@resend.dev` addresses on dev.

## Verification checklist for the human
(filled in stage 7)

## Halted
**HALTED at stage 6 (QA), 2026-10-08.** Not a code failure.

- **Reason:** environment. The QA agent's own cleanup helper deleted the QA tenant account in the dev project, so `QA_TENANT_EMAIL` / `QA_TENANT_PASSWORD` in `.env.qa` no longer sign in (INVALID_LOGIN_CREDENTIALS). A tenant cannot be recreated unattended: Add User sends a password-setup email that only a human with that inbox can complete. Cycle 2 cannot cover the tenant side without it.
- **State:** PR #110 and the QA-found fix PR #113 are merged to `develop`; both deploys to the dev site succeeded (#113's deploy was started by the merge). QA cycle 1 result: 27 of 28 pass, the one failure (no-JS sign-in button) is fixed by #113 and has an e2e test. The production PR has NOT been opened.
- **Evidence:** branch `qa-evidence/p1-data-integrity-fixes` (screenshots, QA specs). Not merged, do not delete.
- **Next step for a human:**
  1. Recreate the QA tenant in the dev project: as the QA admin, Add User with the tenant email (a real inbox you control), open the welcome email, set a password, and make `.env.qa` match. Assign the tenant to a `qa-` property if one is needed.
  2. Resume the lifecycle at stage 6: run QA cycle 2 against the current `develop` (the QA specs from cycle 1 are on the evidence branch and the cleanup helper is fixed), covering the tenant-only checks: tenant regression pass, Make a Payment before hydration, a tenant of a deleted property loading the app, tenant profile scenarios, plus a recheck of the no-JS sign-in click.
  3. Then stage 7: open the production PR (`--base production --head develop`).
  Alternatively, accept the tenant-side gap and go straight to stage 7; the recommended human tests in the QA report already cover those checks.
- **Spec conflict to settle before archive:** see Deferred findings (welcome-email failure behavior vs the `replace-sendgrid-email` change).
