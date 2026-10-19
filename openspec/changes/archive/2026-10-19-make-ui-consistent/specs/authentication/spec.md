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
- **THEN** the user sees "Your email or password is incorrect." in an error notice above the Sign in button, not under either field

#### Scenario: Disabled account
- **WHEN** the credentials belong to a disabled account
- **THEN** the user sees "This account has been disabled. Please contact Lehman Family LLC." and stays on `/signin`

#### Scenario: Too many attempts
- **WHEN** Firebase refuses the sign-in because of too many attempts
- **THEN** the user sees "Too many sign-in attempts. Please wait a few minutes and try again." and stays on `/signin`

#### Scenario: Session cookie cannot be created
- **WHEN** the credentials are accepted but `/api/signin` does not succeed
- **THEN** the user sees "Sign-in is unavailable right now. Please try again." and stays on `/signin`
