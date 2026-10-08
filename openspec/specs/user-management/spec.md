# user-management Specification

## Purpose
Admins create and remove user accounts. Accounts are never self-registered.

## Requirements

### Requirement: Create user
The system SHALL let an admin create a user by email through `POST /api/user/add`.

#### Scenario: New user
- **WHEN** an admin submits an email
- **THEN** a Firebase Auth user is created
- **AND** a Stripe customer is created
- **AND** a `users/{uid}` document is created with `permissions: "user"`, placeholder name "New User", empty phone and the `stripeID`
- **AND** the welcome email with a password-setup link is sent

#### Scenario: Auth creation fails
- **WHEN** Firebase rejects the email, for example because it is a duplicate
- **THEN** the response is 500 and nothing else is created

### Requirement: Delete user
The system SHALL let an admin delete a user through `DELETE /api/user/{userId}`.

#### Scenario: Delete
- **WHEN** an admin deletes a user
- **THEN** the Auth account, the user document and all files under `users/{userId}/` are removed

### Requirement: User directory
The system SHALL list all users to admins, ordered by last name, with a modal showing a user's details.

#### Scenario: Admin lists users
- **WHEN** an admin opens `/admin/users`
- **THEN** every user document is shown ordered by `lastName`

## Known Gaps
