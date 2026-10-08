# Lifecycle: p1-data-integrity-fixes

- Branch: `p1-data-integrity-fixes`
- Stage: 2 Propose + preflight (awaiting Gate A)
- Review round: 0 of 3
- QA cycle: 0 of 3
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
Approved: no
Accepted preflight gaps: none

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
(none yet; one line per round: blockers, majors, fixed, rejected with reason)

## Deferred findings
(minors, nits and known gaps to turn into issues at wrap-up)

## QA report
(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human
(filled in stage 7)

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
