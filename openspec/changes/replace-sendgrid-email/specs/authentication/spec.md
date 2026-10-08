## MODIFIED Requirements

### Requirement: Password reset request
The system SHALL email a password reset link through the configured email provider when requested via `PUT /api/signin/reset`.

#### Scenario: Reset email sent
- **WHEN** a request supplies an email
- **THEN** a Firebase reset link is generated with a continue URL of `PUBLIC_FRONTEND_URL/`
- **AND** a reset email containing that link is sent to that address and `{ status: "email_sent" }` is returned

#### Scenario: Email failure
- **WHEN** link generation fails, the provider rejects the message, or the provider reports an error
- **THEN** the response is 500

## ADDED Requirements

### Requirement: Welcome email
The system SHALL email a newly created user a welcome message containing a Firebase link to set their password, distinct in subject and wording from the reset email.

#### Scenario: Welcome email sent
- **WHEN** an admin adds a user
- **THEN** a Firebase password link with a continue URL of `PUBLIC_FRONTEND_URL/` is generated
- **AND** a welcome email containing that link is sent to the new user's address

#### Scenario: Welcome email failure
- **WHEN** link generation fails or the provider reports an error
- **THEN** the user is still created and `{ status: "New User Created" }` is returned, as the welcome email is not awaited
- **AND** the failure is logged on the server and does not become an unhandled rejection

### Requirement: Email sender identity
The system SHALL send application email from `support@lehmanfamilyllc.com`, in both HTML and plain-text form.

#### Scenario: Sender and body
- **WHEN** any application email is sent
- **THEN** its sender is `support@lehmanfamilyllc.com`
- **AND** it carries an HTML body and a plain-text body that both contain the link
