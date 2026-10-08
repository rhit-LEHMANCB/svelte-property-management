# Lifecycle: p1-data-integrity-fixes

- Branch: `p1-data-integrity-fixes`
- Stage: 7 Production PR (awaiting Gate B: human verifies and merges)
- Review round: 1 of 3 (+1 each for QA fix PRs #113 and #115)
- QA cycle: 3 of 3 (PASS)
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
Fix round (PR #113, QA cycle 1 finding): fresh reviewer, blockers 0, majors 0, nits 2. Not changed.
Fix round (PR #115, QA cycle 2 finding): fresh reviewer, blockers 0, majors 0, minors 2, nits 2. Fixed the e2e setup retry safety; other items deferred below.

## Implementation notes
Stage 3 done 2026-10-08: 21/21 tasks. `npm test` 292 pass, `npm run check` clean, eslint clean, Prettier clean with `--end-of-line auto`, `npm run build` ok, full e2e 53 pass. `npm run check:server` fails on Windows only (pre-existing path bug in scripts/check-server-imports.mjs: `C:C:...`); CI on Linux runs it.

## Deferred findings
- Maintenance form action and the checkout-session endpoint answer 500 (not a 4xx) for a tenant with no property; unreachable from the UI because the pages redirect. Add a 4xx and tests later.
- The dashboard `+page.svelte` check `permissions !== 'admin'` is redundant (admins are redirected away); simplify to `!data.userProperty`.
- The tenant dashboard for a tenant WITH a property is still the "Manager page" stub (issue #43).
- A tenant with an empty phone number cannot save any profile edit (browser validation); pre-dates this change.
- Assignable dropdown shows names only, so every Add User account reads "New User"; Add User failure toast is generic ("Error creating user.").
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
Final: **cycle 3 of 3, PASS**, 36 of 36 tests, run 2026-10-08 against the dev site at develop `42dd3d6` (includes #110, #113, #115). Evidence (50 screenshots, QA specs): branch `qa-evidence/p1-data-integrity-fixes`, folder `openspec/changes/p1-data-integrity-fixes/qa/screenshots/`. Do not merge or delete that branch until Gate B is done.

History:
- Cycle 1 (27/28): app bug, with JavaScript off the Sign in button stayed inert for mouse clicks (fixed in #113). The QA agent's cleanup helper also deleted the QA tenant (environment); the run halted until the tenant was recreated by the user.
- Cycle 2 (32/33): app bug, a tenant with no property got a 500 on every page, which broke the #38 fix for tenants of a deleted property (fixed in #115, new `access-control` spec delta).
- Cycle 3: all pass, QA admin and tenant accounts intact, tenant ended in its starting state (no property).

Covered and passing: assignment (assign, missing tenant, unknown user/property, admin as tenant, options, 409, same property), delete property (property and junction rows removed before the response; tenant of a deleted property loads the app), tenant with no property (dashboard message, /payment and /maintenance redirect to /, profile, insurance, sign-out), create user (new user, duplicate Auth, welcome-email rejection rolls back), delete user (user and junction removed), profile (invalid form, wrong/missing password rejected, unchanged email needs no password; admin and tenant), sign-in before hydration (no JS, scripts blocked, typed early, wrong credentials), no-JS mouse click on Sign in, controls inert with a spinner before hydration then working (sign-in, Add User, Add Property, delete, Make a Payment), regression pass for both roles with no console errors or 5xx.

Not covered by automation: property delete over 500 documents and failure then retry; removal of maintenance requests, payment_history and storage files; Stripe or Firestore failure injection during user create and profile save; delete user's Stripe/Auth/storage removal, "already gone", delete self (400); profile valid save, email change with the correct password, and rollback; tenant with 2+ junctions (500); real email delivery; Stripe payment completion; mobile layout.

## Verification checklist for the human
Do these in order of risk before merging the production PR (dev site first where it applies):

1. **Welcome email and password setup + successful email change** (high). Admin > Users > Add User with an inbox you control; open the email and set a password; sign in; on /profile change the email using the current password. Expect: email arrives, link works on the production domain, then Firebase Auth, the Stripe customer and the profile all show the new email. Also try a wrong password: nothing changes.
2. **Delete a property that has real data** (high). Create a throwaway property with a tenant, a maintenance request, a payment and a photo; delete it. Expect: no `junction_user_property`, `maintenance` or `payment_history` documents or Storage files remain; the tenant signs in and sees "No property is assigned to your account yet."
3. **Delete a user** (high). Delete a throwaway user with a Stripe customer, a junction and an uploaded photo. Expect: Auth account, user doc, junction, Stripe customer and `users/{id}/` files gone; maintenance and payment history kept. Then try deleting your own admin row: expect refusal and no change.
4. **Production-only: environment and secrets** (high). `RESEND_API_KEY` and the Resend sender domain must exist in the production GitHub environment (this release also ships the SendGrid to Resend change from the `replace-sendgrid-email` change). `PUBLIC_FB_API_KEY` is used server-side for the password check (the project's existing key; no new secret). The sign-in POST fallback and email-change password check call `identitytoolkit.googleapis.com` from the server: confirm outbound access and that the key is not restricted to browser referrers only (a referrer-restricted key rejects server calls).
5. **Spec conflict to settle** (medium). `replace-sendgrid-email` says a failed welcome email still creates the user; this change (your interview decision) rolls the whole create back when the email fails. Decide which wins and reconcile the specs before archive.
6. **Stripe live mode** (medium). Stripe customer deletion on user delete is irreversible; with live keys it deletes real customers. Make sure that is wanted. Open issue #98 covers going live.
7. **Tenant with two junctions** (medium). In the Firestore console add a second junction for a throwaway tenant and sign in: expect the 500 "wrong number of properties: 2".
8. **Sign-in on a slow phone** (medium). Throttled connection: type credentials as soon as the form appears and tap Sign in immediately. Expect typed values kept, spinner, no lost input.
9. **Make a Payment with a test card** (medium, dev). Tenant with a property and a balance: click right after load (ignored with a spinner), then pay with 4242 4242 4242 4242.
10. **Tenant with no property on a phone** (low). Check the message wording and layout, and that Payment and Maintenance bounce back to the dashboard.

## Halted
Resolved. The run halted once at stage 6 (2026-10-08) after QA cycle 1 deleted the QA tenant account; the user recreated the tenant and the run resumed with QA cycle 2 and 3. Issue #114 tracked the halt.
