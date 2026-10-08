# Spec Delta

## MODIFIED Requirements

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
