# Lifecycle: sync-firebase-config

- Branch: `firebase-env-sync`
- Stage: 4 Review (round 1 done: 0 blockers, 1 major fixed)
- Review round: 1 of 3
- QA cycle: 0 of 3
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

## Deferred findings
- Restrict Storage reads and move photos to signed URLs.

## QA report
(stage 6)

## Verification checklist for the human
(stage 7)

## Halted
(only if the run halted)
