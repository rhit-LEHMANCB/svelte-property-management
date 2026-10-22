# Spec Delta

## ADDED Requirements

### Requirement: Malformed ID token
The system SHALL reject an ID token that is not a valid Firebase token as a client error, not a server error.

#### Scenario: Malformed ID token
- **WHEN** `POST /api/signin` receives an ID token that Firebase cannot verify
- **THEN** it responds 401 "Invalid ID token" and sets no cookie
