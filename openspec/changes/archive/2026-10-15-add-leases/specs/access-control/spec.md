# Spec Delta

## MODIFIED Requirements

### Requirement: Admin-only operations
The system SHALL reject admin operations from non-admins with 401 "You must be an admin to do this."

#### Scenario: Non-admin calls admin endpoint
- **WHEN** a signed-in user whose `permissions` is not `admin` calls an admin endpoint
- **THEN** the response is 401

#### Scenario: Anonymous caller
- **WHEN** no user is signed in
- **THEN** the response is 401 "You must be logged in to do this."

Admin operations are: creating and deleting users; creating, editing and deleting properties; managing property photos; creating, editing and deleting leases and uploading lease documents; closing maintenance requests; viewing all users, properties, leases and requests.

### Requirement: Tenant property context
The system SHALL give each non-admin user in the authenticated area at most one property, the property of their current lease, and SHALL let a tenant with no current lease use the app instead of failing.

#### Scenario: One property
- **WHEN** a tenant is on exactly one current lease
- **THEN** the layout exposes that lease's property as `userProperty` to all child pages

#### Scenario: No property
- **WHEN** a tenant has no current lease, because they were never added to one, their lease has not started, it has ended, or their property was deleted
- **THEN** the layout loads without `userProperty` and without an error
- **AND** the dashboard shows that no property is assigned, with any upcoming lease
- **AND** `/maintenance` redirects the tenant to `/`
- **AND** `/payment` loads when the tenant has any lease with money owed, and otherwise redirects to `/`
- **AND** `/profile` and `/insurance` load normally

#### Scenario: Wrong number of properties
- **WHEN** a tenant is on more than one current lease, which only data written outside the app can cause
- **THEN** the layout uses the one with the latest start date and logs the conflict

## ADDED Requirements

### Requirement: Lease visibility
The system SHALL show a tenant only the leases they are on, and SHALL NOT expose other leases' tenants, rent or documents to them.

#### Scenario: Another household's lease
- **WHEN** a tenant requests a lease page, document or payment for a lease they are not on
- **THEN** the response is 403 and nothing about that lease is returned
