# authentication Specification

## Purpose
Users sign in with email and password through Firebase Auth. The server exchanges the Firebase ID token for a session cookie and gates every non-public page on it. Accounts are created by admins only, and users set or reset their password through an emailed link.

## Requirements

### Requirement: Session establishment
The system SHALL exchange a freshly issued Firebase ID token for an httpOnly, secure `__session` cookie valid for 5 days.

#### Scenario: Successful sign-in
- **WHEN** a user submits valid credentials on `/signin`
- **THEN** the client posts the ID token to `/api/signin`
- **AND** the server sets the `__session` cookie and the user is sent to `/`

#### Scenario: Stale ID token
- **WHEN** the ID token's `auth_time` is 5 minutes or more old
- **THEN** `/api/signin` responds 401 "Recent sign in required!" and sets no cookie

#### Scenario: Invalid credentials
- **WHEN** Firebase rejects the email or password
- **THEN** the user sees an error toast "Your email or password is incorrect."

### Requirement: Sign-out
The system SHALL end a session by deleting the `__session` cookie via `DELETE /api/signin`.

#### Scenario: Sign-out
- **WHEN** the client calls `DELETE /api/signin`
- **THEN** the cookie is removed and the response is `{ status: "signedOut" }`

### Requirement: Route protection
The system SHALL verify the session cookie on every request and populate `locals.userID` with the verified uid, or null.

#### Scenario: Unauthenticated page request
- **WHEN** the cookie is missing, expired or invalid and the path is not `/signin`, `/reset` or under `/api`
- **THEN** the response is a 303 redirect to `/signin`

#### Scenario: API requests are not redirected
- **WHEN** an unauthenticated request targets a path under `/api`
- **THEN** the hook does not redirect and each endpoint decides its own response

### Requirement: Password reset request
The system SHALL email a password reset link through SendGrid when requested via `PUT /api/signin/reset`.

#### Scenario: Reset email sent
- **WHEN** a request supplies an email
- **THEN** a Firebase reset link is generated with a continue URL of `PUBLIC_FRONTEND_URL/`
- **AND** the reset template email is sent and `{ status: "email_sent" }` is returned

#### Scenario: Email failure
- **WHEN** link generation or sending fails
- **THEN** the response is 500

### Requirement: Password reset completion
The system SHALL let a user set a new password at `/reset` using the Firebase `oobCode` from the emailed link.

#### Scenario: Valid link and password
- **WHEN** `mode=resetPassword`, the code verifies, and the new password satisfies the password policy
- **THEN** the password is changed and a success modal offers to continue

#### Scenario: Wrong mode
- **WHEN** `mode` is not `resetPassword`
- **THEN** the page shows an "Invalid action" error and does not show the reset form

### Requirement: Password policy
The system SHALL require passwords of 8 to 32 characters with at least one lowercase letter, one uppercase letter and one digit or special character, entered twice identically.

#### Scenario: Mismatch
- **WHEN** the two entries differ
- **THEN** validation fails with "Passwords must match" on the verify field

## Known Gaps
- `/signin` has no link to request a password reset; reset is only reachable from `/profile` or by email.
- There is no sign-in rate limiting beyond Firebase's own.
- A wrong `mode` on `/reset` is meant to fail with 400 "Invalid action", but the error is thrown while the page renders, so the response is 500 (#55).
- After a successful reset, Continue navigates with an absolute URL while the form is still marked changed, so the browser asks "Leave site? Changes you made may not be saved" and the user can stay on the reset page (#56).
- The session cookie is set with `maxAge` in milliseconds where SvelteKit expects seconds, so the browser keeps it for about 13.7 years; the underlying Firebase session still expires after 5 days (#54).
- Page carries `TODO` to redirect to the sign-in page after a successful reset; it currently goes to `continueUrl` or `/`.
