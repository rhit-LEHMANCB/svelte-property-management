# user-profile Specification

## Purpose
A signed-in user maintains their own contact details and photo, and can request a password reset from their profile.

## Requirements

### Requirement: Edit contact information
The system SHALL let a user update first name, last name, email and phone number, keeping Firebase Auth, Stripe and Firestore in agreement, and SHALL require the current password to change the email.

#### Scenario: Valid update
- **WHEN** the form validates (names 1 to 250 characters, valid email, valid mobile number)
- **THEN** the Firebase Auth email is updated if it changed
- **AND** the Stripe customer name, email and phone are updated if a `stripeID` exists
- **AND** the Firestore user document is updated last

#### Scenario: Invalid form
- **WHEN** validation fails
- **THEN** nothing is written and the form returns "Invalid form"

#### Scenario: A later step fails
- **WHEN** Stripe or Firestore fails after an earlier step succeeded
- **THEN** the earlier steps are restored to the previous values
- **AND** the form returns an error and the three systems still agree

#### Scenario: Email change with the right password
- **WHEN** the email differs from the current one and the submitted current password is correct
- **THEN** the update proceeds

#### Scenario: Email change without the right password
- **WHEN** the email differs and the current password is missing or wrong
- **THEN** nothing is written and the form returns an error

#### Scenario: Email unchanged
- **WHEN** the email is unchanged
- **THEN** no password is required

### Requirement: Profile photo
The system SHALL store one profile photo per user at `users/{uid}/profile/{timestamp}.{ext}` and record its URL as `photoUrl`.

#### Scenario: Upload
- **WHEN** a non-empty file is uploaded
- **THEN** existing files under `users/{uid}/profile` are deleted first and the new URL is saved

#### Scenario: Empty file
- **WHEN** the file size is 0
- **THEN** the action fails with 400

### Requirement: Request password reset
The system SHALL let a user trigger the reset email from the profile page.

#### Scenario: Reset button
- **WHEN** the user clicks Reset
- **THEN** `PUT /api/signin/reset` is called and a success or error toast shows

## Known Gaps
- None at present.
