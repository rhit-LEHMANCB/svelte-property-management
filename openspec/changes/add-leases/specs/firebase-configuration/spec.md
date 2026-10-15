# Spec Delta

## MODIFIED Requirements

### Requirement: Rules and indexes are versioned in the repo
The system SHALL keep the Firestore security rules, the Storage security rules and the Firestore index definitions in the repository (`firestore.rules`, `storage.rules`, `firestore.indexes.json`), referenced from `firebase.json`, as the single source for every Firebase project.

#### Scenario: Config files exist and match the live projects at adoption
- **WHEN** the change is merged
- **THEN** the committed indexes equal the indexes exported from `lehman-realty-dev` and `lehman-realty` on 2026-10-07, and the committed Storage rules equal the live Storage rules apart from whitespace, comments and the narrowing of public `read` to `get`

#### Scenario: Firestore denies client access
- **WHEN** a client SDK reads or writes any Firestore document, authenticated or not
- **THEN** the committed rules deny the request

#### Scenario: Storage allows public read only
- **WHEN** anyone fetches a Storage object under `properties/` or `users/` by URL
- **THEN** the committed rules allow it, and any client write or bucket listing is denied

#### Scenario: Lease documents are private
- **WHEN** anyone fetches a Storage object under `leases/` by URL, signed in or not
- **THEN** the committed rules deny it
