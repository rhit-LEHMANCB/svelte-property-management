# Spec Delta

## MODIFIED Requirements

### Requirement: Session establishment
The system SHALL exchange a freshly issued Firebase ID token for an httpOnly, secure `__session` cookie valid for 5 days, both as a Firebase session and as the cookie's own browser lifetime.

#### Scenario: Successful sign-in
- **WHEN** a user submits valid credentials on `/signin`
- **THEN** the client posts the ID token to `/api/signin`
- **AND** the server sets the `__session` cookie and the user is sent to `/`

#### Scenario: Cookie lifetime
- **WHEN** `/api/signin` sets the `__session` cookie
- **THEN** its `Max-Age` is 432000 seconds (5 days)

#### Scenario: Stale ID token
- **WHEN** the ID token's `auth_time` is 5 minutes or more old
- **THEN** `/api/signin` responds 401 "Recent sign in required!" and sets no cookie

#### Scenario: Invalid credentials
- **WHEN** Firebase rejects the email or password
- **THEN** the user sees an error toast "Your email or password is incorrect."
