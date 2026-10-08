## Why

The dev (`lehman-realty-dev`) and production (`lehman-realty`) Firebase projects are configured by hand in the console. Exports taken on 2026-10-07 show they have already drifted: production Firestore allows any signed-in user to read and write every document from the client (`request.auth != null`), while dev denies all client access. None of the live rules or indexes are in the repo, so tests run against permissive emulator copies and nothing guarantees the two projects stay the same.

## What Changes

- Commit `firestore.rules` (deny all client access), `storage.rules` (public get, no write, no listing) and `firestore.indexes.json` (the indexes exported from the live projects, identical in both) at the repo root.
- Add `firestore` and `storage` sections to `firebase.json`, and a `.firebaserc` with aliases `dev` (`lehman-realty-dev`) and `prod` (`lehman-realty`).
- Point the e2e emulator config at the committed root rules and delete the permissive copies under `tests/e2e/emulator/`.
- Add a step to the merge workflow that deploys rules and indexes (`firebase deploy --only firestore,storage`) to the project named by `vars.FB_PROJECT_ID` on pushes to `develop` and `production`.
- Document the workflow in the README.
- **BREAKING (production only)**: production Firestore rules change from `request.auth != null` to `false`. The app uses the Admin SDK for all Firestore and Storage access, which ignores rules, so no app behavior changes; any out-of-repo client that reads Firestore directly would stop working.

## Capabilities

### New Capabilities
- `firebase-configuration`: Firestore rules, Storage rules and Firestore indexes live in the repo and are deployed identically to the dev and production Firebase projects by CI; the e2e emulator runs against the same rules.

### Modified Capabilities
(none)

## Impact

- New files: `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `.firebaserc`.
- Changed: `firebase.json`, `firebase.emulators.json`, `.github/workflows/firebase-hosting-merge.yml`, `README.md`; removed: `tests/e2e/emulator/firestore.rules`, `tests/e2e/emulator/storage.rules`.
- The CI service account (`FIREBASE_SERVICE_ACCOUNT_LEHMAN_REALTY`, per environment) needs permission to deploy rules and indexes.
- Out of scope: restricting Storage reads (photo URLs are unsigned, so this is a follow-up), Auth providers and authorized domains, Stripe webhooks, syncing data between projects.
