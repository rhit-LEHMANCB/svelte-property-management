# Spec Delta

## ADDED Requirements

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
