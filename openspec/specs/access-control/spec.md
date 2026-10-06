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

Admin operations are: creating and deleting users; creating, editing and deleting properties; managing property photos; assigning tenants; closing maintenance requests; viewing all users, properties and requests.

### Requirement: Role-based landing
The system SHALL send admins from `/` to `/admin`.

#### Scenario: Admin visits home
- **WHEN** an admin loads `/`
- **THEN** they are redirected 303 to `/admin`

### Requirement: Tenant property context
The system SHALL give each non-admin user in the authenticated area exactly one property, found through `junction_user_property`.

#### Scenario: One property
- **WHEN** a tenant has exactly one junction
- **THEN** the layout exposes `userProperty` to all child pages

#### Scenario: Wrong number of properties
- **WHEN** a tenant has zero or more than one junction
- **THEN** the layout fails with 500 "User is associated with wrong number of properties: N"

### Requirement: Role-specific navigation
The system SHALL show admins Admin, Maintenance, Properties, Users and Profile, and tenants Home, Maintenance, Payment, Profile and Insurance.

#### Scenario: Navigation per role
- **WHEN** the nav renders
- **THEN** the items match the user's role

### Requirement: First login redirect
The system SHALL redirect users flagged `isFirstLogin` to `/profile` before showing other pages.

#### Scenario: Flagged user
- **WHEN** a user with `isFirstLogin` loads any authenticated page
- **THEN** they are redirected 303 to `/profile`

### Requirement: Admin route enforcement (not yet implemented)
The system SHALL deny non-admins access to `/admin/*` pages, not just the admin API.

#### Scenario: Tenant opens an admin URL
- **WHEN** a tenant navigates to `/admin/users`
- **THEN** the server rejects with 401

## Known Gaps
- Admin pages under `/admin/*` check the role in their `load`, so they do fail for tenants, but `/admin/+page.svelte` has no server load; its protection is only the redirect from `/`.
- `isFirstLogin` is read but never written anywhere, so the redirect never triggers for users created by `/api/user/add`.
- Tenant routes (`/maintenance`, `/insurance`, `/payment`) accept admins: they check login only, and admins have no property, so they error.
- The tenant home page is a stub reading "Manager page".
