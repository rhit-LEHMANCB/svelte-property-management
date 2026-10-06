# user-profile Specification

## Purpose
A signed-in user maintains their own contact details and photo, and can request a password reset from their profile.

## Requirements

### Requirement: Edit contact information
The system SHALL let a user update first name, last name, email and phone number.

#### Scenario: Valid update
- **WHEN** the form validates (names 1 to 250 characters, valid email, valid mobile number)
- **THEN** the Firestore user document is updated
- **AND** the Stripe customer name, email and phone are updated if a `stripeID` exists
- **AND** the Firebase Auth email is updated

#### Scenario: Invalid form
- **WHEN** validation fails
- **THEN** nothing is written and the form returns "Invalid form"

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
- The three updates in "Edit contact information" are sequential with no rollback; a Stripe or Auth failure leaves Firestore already changed.
- Changing the email through the Auth admin API does not require re-verification.
