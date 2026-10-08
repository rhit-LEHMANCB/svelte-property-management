# user-management Specification

## Purpose
Admins create and remove user accounts. Accounts are never self-registered.

## Requirements

### Requirement: Create user
The system SHALL let an admin create a user by email through `POST /api/user/add`, and SHALL leave nothing behind when any step fails.

#### Scenario: New user
- **WHEN** an admin submits an email
- **THEN** a Firebase Auth user is created
- **AND** a Stripe customer is created
- **AND** a `users/{uid}` document is created with `permissions: "user"`, placeholder name "New User", empty phone and the `stripeID`
- **AND** the welcome email with a password-setup link is sent before the response

#### Scenario: Auth creation fails
- **WHEN** Firebase rejects the email, for example because it is a duplicate
- **THEN** the response is 500 and nothing else is created

#### Scenario: A later step fails
- **WHEN** the Stripe call, the Firestore write or the welcome email fails after earlier steps succeeded
- **THEN** the Auth user, Stripe customer and user document that were created are removed
- **AND** the response is 500

### Requirement: Delete user
The system SHALL let an admin delete a user through `DELETE /api/user/{userId}` and SHALL remove every link to that user, except records kept for history.

#### Scenario: Delete
- **WHEN** an admin deletes a user
- **THEN** the Auth account, the user document, the user's `junction_user_property` rows, the user's Stripe customer and all files under `users/{userId}/` are removed
- **AND** the user's maintenance requests and payment history are kept

#### Scenario: Already gone
- **WHEN** the Stripe customer or Auth account no longer exists
- **THEN** that step counts as done and the rest completes

#### Scenario: Delete self
- **WHEN** an admin deletes their own account
- **THEN** the response is 400 and nothing is removed

### Requirement: User directory
The system SHALL list all users to admins, ordered by last name, with a modal showing a user's details.

#### Scenario: Admin lists users
- **WHEN** an admin opens `/admin/users`
- **THEN** every user document is shown ordered by `lastName`

## Known Gaps
- None at present.
