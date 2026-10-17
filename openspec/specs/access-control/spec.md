# access-control Specification

## Purpose
Two roles exist, `admin` and `user` (tenant), stored as `permissions` on the user document in Firestore. This spec defines what each role may do and how the app routes them after login.

## Requirements

### Requirement: Admin-only operations
The system SHALL reject admin operations from non-admins with 401 "You must be an admin to do this."

#### Scenario: Non-admin calls admin endpoint
- **WHEN** a signed-in user whose `permissions` is not `admin` calls an admin endpoint
- **THEN** the response is 401

#### Scenario: Anonymous caller
- **WHEN** no user is signed in
- **THEN** the response is 401 "You must be logged in to do this."

Admin operations are: creating and deleting users; creating, editing and deleting properties; managing property photos; creating, editing and deleting leases and uploading lease documents; closing maintenance requests; viewing all users, properties, leases and requests.

### Requirement: Role-based landing
The system SHALL send admins from `/` to `/admin`.

#### Scenario: Admin visits home
- **WHEN** an admin loads `/`
- **THEN** they are redirected 303 to `/admin`

### Requirement: Tenant property context
The system SHALL give each non-admin user in the authenticated area at most one property, the property of their current lease, and SHALL let a tenant with no current lease use the app instead of failing.

#### Scenario: One property
- **WHEN** a tenant is on exactly one current lease
- **THEN** the layout exposes that lease's property as `userProperty` to all child pages

#### Scenario: No property
- **WHEN** a tenant has no current lease, because they were never added to one, their lease has not started, it has ended, or their property was deleted
- **THEN** the layout loads without `userProperty` and without an error
- **AND** the dashboard names the upcoming lease that starts next, with its start date and a link to `/payment` when money can be paid now, or, with no upcoming lease, shows that no property is assigned
- **AND** `/maintenance` stays on the page and explains why requests are not available, naming the upcoming lease and its start date when there is one
- **AND** `/payment` lists their upcoming leases (with autopay setup) and any ended lease with money owed, and with none says there is no lease to pay for
- **AND** `/profile` and `/insurance` load normally

#### Scenario: Wrong number of properties
- **WHEN** a tenant is on more than one current lease, which only data written outside the app can cause
- **THEN** the layout uses the one with the latest start date and logs the conflict

### Requirement: Role-specific navigation
The system SHALL show admins Home, Maintenance, Properties, Users and Profile, and tenants Dashboard, Maintenance, Payment, Profile, Insurance and About Us.

#### Scenario: Navigation per role
- **WHEN** the nav renders
- **THEN** the items match the user's role

### Requirement: First login redirect
The system SHALL redirect users flagged `isFirstLogin` to `/profile` before showing other pages.

#### Scenario: Flagged user
- **WHEN** a user with `isFirstLogin` loads any authenticated page
- **THEN** they are redirected 303 to `/profile`

### Requirement: Admin route enforcement
The system SHALL deny non-admins access to `/admin/*` pages, including `/admin` itself, on the server and not only in the admin API.

#### Scenario: Tenant opens an admin URL
- **WHEN** a tenant navigates to `/admin/users`
- **THEN** the server rejects with 401

#### Scenario: Tenant opens the admin home
- **WHEN** a tenant navigates to `/admin`
- **THEN** the server rejects with 401

### Requirement: Tenant-only routes
The system SHALL redirect admins who open `/maintenance`, `/insurance`, `/payment` or any page under `/payment` to `/admin`, and SHALL NOT error.

#### Scenario: Admin opens a tenant page
- **WHEN** an admin loads `/payment`, `/maintenance` or `/insurance`
- **THEN** the response is a 303 redirect to `/admin`

#### Scenario: Tenant opens a tenant page
- **WHEN** a tenant with one property loads `/payment`
- **THEN** the page loads as before

### Requirement: Lease visibility
The system SHALL show a tenant only the leases they are on, and SHALL NOT expose other leases' tenants, rent or documents to them.

#### Scenario: Another household's lease
- **WHEN** a tenant requests a lease page, document or payment for a lease they are not on
- **THEN** the response is 403 and nothing about that lease is returned

## Known Gaps
- `isFirstLogin` is read but never written anywhere, so the redirect never triggers for users created by `/api/user/add`.
- The tenant home page is a stub reading "Manager page".
