# firebase-configuration Specification

## Purpose
TBD - created by archiving change sync-firebase-config. Update Purpose after archive.

## Requirements

### Requirement: Rules and indexes are versioned in the repo
The system SHALL keep the Firestore security rules, the Storage security rules and the Firestore index definitions in the repository (`firestore.rules`, `storage.rules`, `firestore.indexes.json`), referenced from `firebase.json`, as the single source for every Firebase project.

#### Scenario: Config files exist and match the live projects at adoption
- **WHEN** the change is merged
- **THEN** the committed indexes equal the indexes exported from `lehman-realty-dev` and `lehman-realty` on 2026-10-07, and the committed Storage rules equal the live Storage rules apart from whitespace, comments and the narrowing of public `read` to `get`

#### Scenario: Firestore denies client access
- **WHEN** a client SDK reads or writes any Firestore document, authenticated or not
- **THEN** the committed rules deny the request

#### Scenario: Storage allows public read only
- **WHEN** anyone fetches a Storage object by URL
- **THEN** the committed rules allow it, and any client write or bucket listing is denied

### Requirement: Project aliases
The repo SHALL define Firebase CLI aliases `dev` for `lehman-realty-dev` and `prod` for `lehman-realty` in `.firebaserc`.

#### Scenario: Local deploy targets an alias
- **WHEN** a developer runs `firebase deploy --only firestore,storage --project dev`
- **THEN** the CLI resolves the alias and deploys to `lehman-realty-dev`

### Requirement: CI deploys rules and indexes
The merge workflow SHALL deploy the committed Firestore rules, Storage rules and indexes to the Firebase project named by the GitHub environment's `FB_PROJECT_ID` on every push to `develop` and `production`, and SHALL fail the run if that deploy fails.

#### Scenario: Merge to develop
- **WHEN** a change is pushed to `develop`
- **THEN** the dev project receives the committed rules and indexes

#### Scenario: Merge to production
- **WHEN** a change is pushed to `production`
- **THEN** the production project receives the same committed rules and indexes

#### Scenario: Deploy failure
- **WHEN** the rules and indexes deploy step fails
- **THEN** the workflow run fails

### Requirement: Emulator uses the committed rules
The end-to-end test setup SHALL run the Firestore and Storage emulators with the committed root rules files, and the repo SHALL NOT keep separate permissive copies.

#### Scenario: E2E run
- **WHEN** `npm run test:e2e` runs
- **THEN** the emulators load `firestore.rules` and `storage.rules` from the repo root and the suite passes
