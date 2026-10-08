# Lifecycle: sync-firebase-config

- Branch: `firebase-env-sync`
- Stage: 7 Production PR open (Gate B pending)
- Review round: 3 of 3
- QA cycle: 1 of 3
- Started: 2026-10-07

## Interview summary
(approved: yes)

**Goal.** Make `lehman-realty-dev` and `lehman-realty` (production) match because the repo deploys the same Firebase config to both, not because someone clicks in the console.

**Findings from exporting both live projects (read-only, via the Firebase CLI).**
- Firestore indexes: identical in both projects. The repo has no `firestore.indexes.json`.
- Storage rules: public read, no write, in both.
- Firestore rules differ. Prod is `allow read, write: if request.auth != null`. Dev is `if false`. The app reaches Firestore and Storage only through the Admin SDK, which ignores rules; the client SDK never touches either.
- The repo has no `.firebaserc`; `firebase.json` only configures Hosting. The e2e emulator uses separate permissive copies under `tests/e2e/emulator/`.

**Scope.**
1. Commit `firestore.rules` (deny all: `allow read, write: if false`), `storage.rules` (existing public read) and `firestore.indexes.json` (exported) at the repo root.
2. Add `firestore` and `storage` entries to `firebase.json`.
3. Add `.firebaserc` with aliases `dev` (`lehman-realty-dev`) and `prod` (`lehman-realty`).
4. Point `firebase.emulators.json` at the root rules files and delete `tests/e2e/emulator/*.rules`; the e2e suite must still pass.
5. In `firebase-hosting-merge.yml`, deploy rules and indexes (`--only firestore,storage`) to the project in `vars.FB_PROJECT_ID`, on pushes to `develop` and `production`.
6. Document the workflow in the README.

**Out of scope.** Restricting Storage reads (photos load from unsigned `?alt=media` URLs, so signed-in-only reads would break them; follow-up change). Auth providers, authorized domains, Stripe webhooks. Syncing data between projects.

**Roles and behavior.** No app behavior change for admins or tenants (server code uses the Admin SDK). Direct client access to Firestore in production is removed. Public Storage reads are unchanged.

**Security.** Closes the hole where any signed-in production user could read and write all of Firestore directly.

**Acceptance.**
- WHEN the deploy runs on `develop` THEN `lehman-realty-dev` has the committed Firestore rules, Storage rules and indexes.
- WHEN the production PR merges THEN `lehman-realty` gets the same files; its Firestore rule changes from `request.auth != null` to `false`.
- WHEN `npm run test:e2e` runs THEN it uses the committed rules and passes.
- WHEN `firebase deploy --only firestore,storage --project dev` is run locally THEN it works through the alias.

**Rollout notes.** The CI service account (`FIREBASE_SERVICE_ACCOUNT_LEHMAN_REALTY`) needs permission to deploy rules and indexes (for example Firebase Rules Admin and Cloud Datastore Index Admin) in both projects. Confirm before the production deploy.

**Assumptions.** Node 22 (`.nvmrc`); the CLI is called via `npx firebase-tools`; exports taken 2026-10-07 are the baseline; a failed rules deploy fails the workflow.

## Gate A
Approved: yes (2026-10-07)
Accepted preflight gaps: CI service account deploy roles unverified; gh pr merge untested; QA logins untested until stage 6

## Preflight
(stage 2)

## Review rounds
Round 1: 0 blockers, 1 major (no test of committed rules) fixed with tests/e2e/specs/rules.spec.ts; minors fixed: Storage allow get instead of read, credentials file umask and empty-secret guard, README notes on rollback and extra indexes, Git Bash note; boilerplate comment removed.
Round 2: 0 blockers, 1 major (rules test ran anonymous only; the old request.auth != null rule would pass) fixed by also running signed-in; verified by temporarily restoring the old rule (signed-in case fails). Minors: set -euo pipefail added, README says "at least" for roles.
Round 3: 0 blockers, 0 majors, 3 minors, 3 nits. Fixed: concurrency group on the merge job; README role wording. Deferred below.

## Deferred findings
- Restrict Storage reads and move photos to signed URLs.
- Add a PR-time rules compile or deploy --dry-run check (needs credentials in the PR workflow).
- Developers with a local .firebaserc that sets a default project will see a conflict on pull (mention in PR).

## QA report
Result: PASS, QA cycle 1 of 3, 2026-10-07, against https://lehman-realty-dev.web.app (commit `5db1397`, PR #100). The first dev deploy failed on a missing service-account permission (issue #101); after the roles were granted by a human the rerun succeeded and the live dev rules, Storage rules and indexes were confirmed equal to the committed files. Evidence branch: `qa-evidence/sync-firebase-config` (screenshots under `openspec/changes/sync-firebase-config/qa/screenshots/`, specs under `tests/qa/sync-firebase-config/`). One screenshot (Stripe Checkout) and the profile-page and Users-page screenshots were removed because they show email addresses or personal data.

| Scenario | Result | Evidence |
|---|---|---|
| Firestore denies client access (anonymous: read doc, list two collections, create) | pass | 4 x 403 PERMISSION_DENIED, `rules.spec.ts` log |
| Firestore denies client access (signed-in tenant, same four calls) | pass | 4 x 403 PERMISSION_DENIED |
| Storage allows public read (property photo, profile photo, metadata; anonymous and tenant) | pass | 200 image/png and image/jpeg |
| Storage denies write, delete and listing (anonymous and tenant) | pass | 403 "Permission denied."; photo still 200 afterwards |
| Admin signs in; home, admin, properties, users, maintenance, profile load with data | pass | regression-admin-*.png |
| Property photo and profile photo display from Storage | pass | regression-admin-admin-properties.png |
| Tenant signs in; dashboard, maintenance, payment, insurance, profile load | pass | regression-tenant-*.png |
| Tenant creates a maintenance request; admin sees it and closes it (Admin SDK read/write) | pass | regression-tenant-maintenance-create.png, regression-admin-maintenance-closed.png |
| Tenant payment: Make a Payment opens Stripe Checkout in Sandbox (test mode); not paid | pass | screenshot removed (shows an email) |

No HTTP responses of 400 or above, console errors, page errors or broken images across both roles. A rules denial was told apart from other 403s by message shape (Firestore PERMISSION_DENIED "Missing or insufficient permissions", Storage "Permission denied.") and by controls with a wrong project and a bad API key.

Failures: none in the app. Two test bugs in the QA scripts were fixed (payment modal not filled; admin cleanup test subject).

Observations: closed `qa-rules-*` maintenance requests remain in dev Firestore because the app has no delete; older open `qa-leak` requests predate this run. The "qa-property" has no photo and shows a placeholder, as intended.

Not covered by automation: the CI deploy and its failure path, repo files and the emulator suite (checked separately by CI and local runs), production, composite-index queries beyond the pages visited, photo upload through the app, auto-pay, the webhook, password-reset email, phone layout.

## Verification checklist for the human
Ranked by risk. Items 1 to 3 are the production-only risks; do them before or immediately after merging.

1. **Production CI service account has the roles** (high). In Google Cloud IAM for `lehman-realty`, confirm `github-action-669953865@lehman-realty.iam.gserviceaccount.com` has Firebase Viewer, Firebase Rules Admin and Cloud Datastore Index Admin, and that it is the account in the `production` environment's `FIREBASE_SERVICE_ACCOUNT_LEHMAN_REALTY` secret. Without them the production run fails at the new step and the Hosting deploy is skipped (exactly what happened on dev the first time; IAM grants can take a few minutes to apply, so rerun if the first attempt returns 403). Expected: the "Deploy Firestore and Storage rules and Firestore indexes" step goes green.
2. **Nothing outside the app reads production Firestore directly** (high). Production rules change from `request.auth != null` to deny-all. In the Firebase console for `lehman-realty`, check Firestore → Usage or Rules → Monitor for client-SDK traffic, and think about any scripts, dashboards or other apps using this project with a client login. Expected: none. Rollback if wrong: Firestore → Rules → history → restore the previous ruleset.
3. **After the production deploy, check the live rules and sanity-check the site** (high). Firebase console, `lehman-realty`: Firestore rules show `allow read, write: if false`, Storage rules show `allow get`. Sign in on the production site as an admin and a tenant and load properties, users, maintenance and payment; confirm photos display. Expected: everything loads as before.
4. **Upload a photo through the app** (medium). On dev (or production after the merge), as a tenant upload a profile picture and as an admin add an image to a property, reload, and open the image URL in a private window. Expected: the upload works and the image loads. The automation did not drive uploads.
5. **Check indexes on production** (medium). Firebase console → Firestore → Indexes on `lehman-realty`: the four `maintenance` indexes exist and are enabled; the deploy does not delete any extra console-only indexes. Open the Maintenance pages as admin and tenant. Expected: no "index required" errors.
6. **Stripe test payment on dev** (low). Pay $1 with card 4242 4242 4242 4242 as the QA tenant and confirm the success page and the transaction history update (exercises the webhook write). Expected: payment recorded once.
7. **Clean up dev QA data** (low). Delete the closed `qa-rules-*` and old `qa-leak` maintenance requests in the dev Firestore console.

## Halted
(only if the run halted)
