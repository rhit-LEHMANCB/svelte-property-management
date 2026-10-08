## 1. Config files

- [ ] 1.1 Add `firestore.rules` (`allow read, write: if false`) and `storage.rules` (public read, no write, cleaned from the live ruleset) at the repo root
- [ ] 1.2 Add `firestore.indexes.json` from the live export
- [ ] 1.3 Add `firestore` and `storage` sections to `firebase.json` (keep `hosting` unchanged)
- [ ] 1.4 Add `.firebaserc` with `dev` and `prod` aliases and no default project

## 2. Emulator

- [ ] 2.1 Point `firebase.emulators.json` at the root rules files and delete `tests/e2e/emulator/firestore.rules` and `storage.rules`
- [ ] 2.2 Run `npm run test:e2e` and confirm it passes against the committed rules

## 3. CI

- [ ] 3.1 Add the rules and indexes deploy step to `.github/workflows/firebase-hosting-merge.yml` before the Hosting deploy, using the existing service account secret and `vars.FB_PROJECT_ID`; clean up the credentials file afterwards
- [ ] 3.2 Validate the workflow YAML and run the deploy command locally with `--dry-run` against `--project dev` if the CLI supports it

## 4. Docs

- [ ] 4.1 Document the aliases, how to deploy rules locally, how to re-export indexes, and the service-account roles needed in `README.md`

## 5. Verify

- [ ] 5.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run test:e2e` and `npm run build`
