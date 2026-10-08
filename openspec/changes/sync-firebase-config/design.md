## Context

`firebase.json` configures only Hosting (web frameworks). Rules and indexes exist only in the console; `tests/e2e/emulator/*.rules` are `if true` copies used by `firebase.emulators.json`. All Firestore and Storage access in `src/` goes through `firebase-admin` (`src/lib/server/admin.ts`), which bypasses rules; no code imports `firebase/firestore` or `firebase/storage`. Photo URLs are unsigned `firebasestorage.googleapis.com/...?alt=media` links, so Storage reads must stay public. The merge workflow deploys Hosting with `FirebaseExtended/action-hosting-deploy` and a per-environment service account in the `develop` and `production` GitHub environments.

## Goals / Non-Goals

**Goals:** one committed copy of rules and indexes; identical deploy to dev and prod; tests run against the real rules; no app behavior change.
**Non-Goals:** restricting Storage reads, Auth/Stripe console settings, data sync, Terraform.

## Decisions

- **Firestore rules `allow read, write: if false`.** Matches dev and is safe because only the Admin SDK touches Firestore. Alternative (keep prod `request.auth != null`) leaves every signed-in tenant able to read all data.
- **Storage rules unchanged** (public read, no write), with cleaned whitespace. Alternative (signed-in only) breaks every photo; deferred.
- **Indexes from the live export** via `firebase firestore:indexes`, committed verbatim (`density` fields kept). Both projects returned identical output.
- **Deploy with the Firebase CLI in the merge workflow** (`npx firebase-tools@<pinned> deploy --only firestore,storage --project "$FB_PROJECT_ID"`), authenticated with the same service account the Hosting step uses. The service account JSON is written to a temp file and exposed through `GOOGLE_APPLICATION_CREDENTIALS`, then removed. Alternative: a separate manual workflow (rejected: drift returns).
- **Ordering:** run the rules/indexes deploy before the Hosting deploy so new code never ships ahead of the indexes it needs.
- **Emulator:** `firebase.emulators.json` points at root `firestore.rules` and `storage.rules`; the e2e hooks and the seed script use the Admin SDK, so they are unaffected. Delete the old copies.
- **`.firebaserc`** defines `dev`/`prod` aliases and no default, so a bare CLI command cannot hit production by accident.

## Risks / Trade-offs

- [CI service account lacks rules/index permissions] → Preflight and the first deploy to `develop` reveal it; document the roles needed (Firebase Rules Admin, Cloud Datastore Index Admin) in the README. Production is deployed only after dev succeeds.
- [Production rule tightening breaks an unknown client] → The repo has none; the `lehman-realty` console can be checked before the production merge. Rollback is redeploying the old ruleset from the console history.
- [Index deploy fails if the live project has indexes not in the file] → `--only firestore` does not delete extra indexes without `--force`; the first dev run shows any difference.
- [Rules tests on the emulator are weaker than prod] → Accepted; the rules are a single deny-all.

## Migration Plan

1. Merge to `develop`: CI deploys to dev; verify in the Firebase console that rules and indexes match.
2. QA on the dev site confirms the app works with deny-all Firestore rules.
3. Human merges the production PR: CI deploys to `lehman-realty`. Rollback: restore the previous ruleset from console history.
