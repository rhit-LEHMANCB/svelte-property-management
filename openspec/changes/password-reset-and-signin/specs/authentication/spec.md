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

#### Scenario: Disabled account
- **WHEN** the credentials belong to a disabled account
- **THEN** the user sees "This account has been disabled. Please contact Lehman Family LLC." and stays on `/signin`

#### Scenario: Too many attempts
- **WHEN** Firebase refuses the sign-in because of too many attempts
- **THEN** the user sees "Too many sign-in attempts. Please wait a few minutes and try again." and stays on `/signin`

#### Scenario: Session cookie cannot be created
- **WHEN** the credentials are accepted but `/api/signin` does not succeed
- **THEN** the user sees "Sign-in is unavailable right now. Please try again." and stays on `/signin`

### Requirement: Route protection
The system SHALL verify the session cookie on every request and populate `locals.userID` with the verified uid, or null.

#### Scenario: Unauthenticated page request
- **WHEN** the cookie is missing, expired or invalid and the path is not `/signin`, `/forgot`, `/reset` or under `/api`
- **THEN** the response is a 303 redirect to `/signin`

#### Scenario: API requests are not redirected
- **WHEN** an unauthenticated request targets a path under `/api`
- **THEN** the hook does not redirect and each endpoint decides its own response

#### Scenario: Forgot password page is public
- **WHEN** a request without a valid session targets `/forgot`
- **THEN** the page is served without a redirect

### Requirement: Password reset request
The system SHALL email a password reset link through the configured email provider when requested via `PUT /api/signin/reset` or the `/forgot` page, and SHALL answer the same way whether or not an account exists for the email.

#### Scenario: Reset email sent
- **WHEN** a request supplies the email of an existing account that is within the rate limit
- **THEN** a Firebase reset link is generated with a continue URL of `PUBLIC_FRONTEND_URL/`
- **AND** a reset email containing that link is sent to that address and `{ status: "email_sent" }` is returned

#### Scenario: Unknown email
- **WHEN** a request supplies an email that has no account
- **THEN** no email is sent and the response is the same `{ status: "email_sent" }`

#### Scenario: Email failure
- **WHEN** link generation fails for a reason other than an unknown account, the provider rejects the message, or the provider reports an error
- **THEN** the response is 500

### Requirement: Password reset completion
The system SHALL let a user set a new password at `/reset` using the Firebase `oobCode` from the emailed link, and then send them to `/signin`.

#### Scenario: Valid link and password
- **WHEN** `mode=resetPassword`, the code verifies, and the new password satisfies the password policy
- **THEN** the password is changed and a success modal offers to continue

#### Scenario: Wrong mode
- **WHEN** `mode` is not `resetPassword`
- **THEN** the response is 400 with "Invalid action" and the reset form is not shown

#### Scenario: Missing code
- **WHEN** `mode=resetPassword` but there is no `oobCode`
- **THEN** the response is 400 with "Invalid action" and the reset form is not shown

#### Scenario: Continue after a reset
- **WHEN** the user presses Continue in the success modal
- **THEN** the browser goes to `/signin` without a "Leave site?" prompt, whatever `continueUrl` the link carried
- **AND** `/signin` shows "Your password was changed. Please sign in."

### Requirement: Sign-in before hydration
The system SHALL let a user sign in with the sign-in form before or without client-side scripts, and SHALL NOT lose values typed before the page finished loading.

#### Scenario: Submit before hydration
- **WHEN** a user submits the sign-in form before the page has hydrated, or without JavaScript
- **THEN** the form posts to the server, which checks the credentials, sets the `__session` cookie and sends the user to `/`

#### Scenario: Typed early
- **WHEN** a user types an email and password immediately after the page appears
- **THEN** both values are still present and used when the page finishes hydrating

#### Scenario: Wrong credentials on the POST form
- **WHEN** the credentials are wrong
- **THEN** the form is shown again with "Your email or password is incorrect." and the email kept

#### Scenario: Disabled or rate-limited account on the POST form
- **WHEN** Firebase reports the account as disabled or refuses for too many attempts
- **THEN** the form is shown again with the matching message from Session establishment and the email kept

#### Scenario: Session failure on the POST form
- **WHEN** the credentials are accepted but the session cookie cannot be created
- **THEN** the form is shown again with "Sign-in is unavailable right now. Please try again.", no cookie is set, and the response is not a bare 500 page

## ADDED Requirements

### Requirement: Password reset rate limit
The system SHALL send at most one password reset email per email address per minute and at most five per hour, counting requests case-insensitively by address, whether or not an account exists.

#### Scenario: Second request within a minute
- **WHEN** a reset is requested twice for the same address within one minute
- **THEN** only one email is sent and both requests get the same answer

#### Scenario: Sixth request within an hour
- **WHEN** a sixth reset is requested for the same address within one hour
- **THEN** no email is sent for it and the answer is the same as for a sent email

#### Scenario: Case-insensitive address
- **WHEN** resets are requested for `Tenant@Example.com` and `tenant@example.com` within one minute
- **THEN** they count as the same address

### Requirement: Forgot password page
The system SHALL provide a public `/forgot` page, linked as "Forgot password?" from `/signin`, where a signed-out user requests a reset email, with or without client-side scripts.

#### Scenario: Request from the sign-in page
- **WHEN** a signed-out user follows "Forgot password?" on `/signin` and submits an email on `/forgot`
- **THEN** the page shows "If an account exists for that email, we've sent a reset link."

#### Scenario: Same answer for unknown or limited emails
- **WHEN** the email has no account or is over the rate limit
- **THEN** the page shows the same message as for a sent email

#### Scenario: Empty or invalid email
- **WHEN** the submitted email is empty or not an email address
- **THEN** the page asks for a valid email and no reset is requested

#### Scenario: Delivery failure
- **WHEN** the reset email cannot be sent for an existing account
- **THEN** the page shows "We couldn't send the email right now. Please try again." and keeps the email
