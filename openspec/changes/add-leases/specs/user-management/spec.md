# Spec Delta

## MODIFIED Requirements

### Requirement: Delete user
The system SHALL let an admin delete a user through `DELETE /api/user/{userId}` and SHALL remove every link to that user, except records kept for history.

#### Scenario: Delete
- **WHEN** an admin deletes a user
- **THEN** the Auth account, the user document, the user's `junction_user_property` rows, the user's Stripe customer and all files under `users/{userId}/` are removed
- **AND** the user is removed from every lease they are on
- **AND** the user's maintenance requests, payment history and leases are kept

#### Scenario: Last tenant on a lease
- **WHEN** the deleted user was the only tenant on a lease
- **THEN** the lease is kept with no tenants, so its payment history stays, and the admin lease list shows it with no tenants

#### Scenario: Already gone
- **WHEN** the Stripe customer or Auth account no longer exists
- **THEN** that step counts as done and the rest completes

#### Scenario: Delete self
- **WHEN** an admin deletes their own account
- **THEN** the response is 400 and nothing is removed
